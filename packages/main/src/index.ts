// Suprimir DEP0169 (url.parse) que emiten dependencias transitivas (node-fetch, cacheable-request, etc.)
// process.on('warning') no evita la impresión; hay que interceptar process.emit.
{
  const _emit = process.emit;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process as any).emit = function (event: string | symbol, ...args: any[]): boolean {
    if (event === 'warning' && (args[0] as { code?: string } | undefined)?.code === 'DEP0169') return false;
    return Reflect.apply(_emit, process, [event, ...args]) as boolean;
  };
}

import path from 'node:path';
import { app, BrowserWindow, dialog, protocol, shell, type Session, type WebContentsView } from 'electron';
import { registerVelaProtocol } from './protocols/velaProtocol';
import { registerPreviewProtocol } from './protocols/previewProtocol';
import { DiscardManager } from './discard/DiscardManager';
import { ElectronChromeExtensions } from 'electron-chrome-extensions';
import { createMainWindow } from './window/createMainWindow';
import { getAppIconPath } from './window/iconPath';
import { EXTENSIONS_DIR, loadExtensions } from './extensions/loadExtensions';
import { registerExtensionShortcuts } from './extensions/extensionCommands';
import { attachServiceWorkerKeepAlive } from './extensions/serviceWorkerKeepAlive';
import { initLogger, logger, closeLogger } from './logger';
import { initStorage, getDb, closeStorage } from './storage/db';
import { initUpdater, shutdownUpdater } from './updater';
import { buildIpcContext, registerAllHandlers, type IpcContext } from './ipc';
import { InitialProfileMigration } from './migration/InitialProfileMigration';
import { CommandRegistry } from './commands/registry';
import { registerCoreCommands } from './commands/definitions';
import {
  attachShortcuts,
  attachWindowShortcuts,
  buildShortcutTable,
  getSystemCombos,
  type ShortcutTable,
} from './shortcuts';
import { registerShortcutsHandlers } from './ipc/shortcuts';
import { registerCommandsHandlers } from './ipc';
import { IPC_EVENTS } from '@vela/shared';
import { GlobalSettings } from './settings';
import { attachWebContextMenu } from './tabs/webContextMenu';
import { GestureRecognizer } from './gestures/GestureRecognizer';
import { buildJumpList, parseJumpListArgs } from './jumplist';
import { isBlindedProfile } from './profiles/blindedProfileUtils';
import { registerWindowsCapabilities } from './platform/windowsBrowserRegistration';
import { clearWindowsToastHistory } from './platform/windowsToastHistory';

// Debe llamarse antes de app.whenReady — protocol.handle no funciona si el
// esquema no está registrado como privilegiado de antemano.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vela',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      allowServiceWorkers: false,
    },
  },
  {
    scheme: 'vela-preview',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: false,
    },
  },
]);

app.userAgentFallback = app.userAgentFallback
  .replace(/ Electron\/[\d.]+/, '')
  .replace(new RegExp(` ${app.getName()}\\/[\\d.]+`, 'i'), '');

// Evita que navigator.webdriver sea true (señal que Google usa para detectar
// navegadores automatizados/embebidos).
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Forzar español como idioma del motor Chromium. Afecta a navigator.language,
// chrome.i18n.getUILanguage() en extensiones y la UI nativa de Chromium.
// Debe establecerse antes de app.whenReady().
app.commandLine.appendSwitch('lang', 'es-ES');

// Sin este lock pueden arrancar dos procesos Electron simultáneamente,
// lo que provoca colisiones de caché (Access Denied en Windows) y rompe
// la coordinación multi-ventana, que requiere un único proceso.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// Cuando el usuario lanza el ejecutable mientras ya hay una instancia viva,
// el SO señaliza este proceso vía second-instance. Abrimos una nueva ventana
// coordinada en lugar de arrancar un segundo proceso.
app.on('second-instance', (_event, argv) => {
  const args = parseJumpListArgs(argv);
  if (args.privateWindow) {
    void ipcCtx?.profileWindowManager.openBlindedWindow(args.url ?? undefined).catch((err: unknown) => {
      logger.warn('[app] openBlindedWindow (second-instance) falló', err);
    });
  } else if (args.url) {
    // Un programa/archivo externo pide abrir una URL: se añade como pestaña
    // nueva en la última ventana activa en lugar de abrir una ventana nueva.
    void openUrlInLastActiveWindow(args.url).catch((err: unknown) => {
      logger.warn('[app] openUrlInLastActiveWindow (second-instance) falló', err);
    });
  } else {
    void openStartupWindow({ profileId: args.profileId });
  }
});

const LAST_ACTIVE_PROFILE_KEY = 'last-active-profile';

const isDev = !app.isPackaged;
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'] ?? 'http://localhost:5173';
const RENDERER_INDEX = path.join(__dirname, '..', '..', 'renderer', 'dist', 'index.html');

// Una instancia de ElectronChromeExtensions por sesión Electron. Tras Fase 3
// cada perfil usa su propia sesión particionada, y ECE exige que la sesión del
// WebContents coincida con la sesión con la que se construyó. Por eso no podemos
// tener una instancia global apuntando a defaultSession.
const extensionsBySession = new Map<Session, ElectronChromeExtensions>();
// Sesiones para las que ya se cargaron las extensiones bundled. Separado del
// mapa de ECE porque la creación de ECE ocurre antes (en onProfileSessionReady)
// mientras que la carga de bundles se difiere hasta tener contexto de ventana.
const bundledLoadedForSession = new Set<Session>();
// True mientras Vela le está contando a ECE cuál es la pestaña activa. Evita
// que el hook `selectTab` rebote la activación de vuelta contra TabManager.
let sincronizandoTabActiva = false;
// Rehace la tabla de atajos; la asigna `app.whenReady` una vez existe el
// registry de comandos.
let refreshExtensionShortcuts: (() => void) | null = null;
// Sesiones cuyos eventos de carga de extensiones ya escuchamos.
// `session.fromPartition` devuelve siempre la misma instancia y un perfil puede
// reabrirse, así que sin esto acumularíamos listeners.
const shortcutRefreshAttached = new WeakSet<Session>();

function attachExtensionShortcutRefresh(ses: Session): void {
  if (shortcutRefreshAttached.has(ses)) return;
  shortcutRefreshAttached.add(ses);
  let pendiente: NodeJS.Timeout | null = null;
  const refrescar = (): void => {
    if (pendiente) clearTimeout(pendiente);
    // Las extensiones se cargan en ráfaga al abrir un perfil: agrupamos.
    pendiente = setTimeout(() => {
      pendiente = null;
      refreshExtensionShortcuts?.();
    }, 250);
  };
  ses.extensions.on('extension-loaded', refrescar);
  ses.extensions.on('extension-unloaded', refrescar);
}

function getOrCreateExtensions(ses: Session, win?: BrowserWindow): ElectronChromeExtensions {
  let ext = extensionsBySession.get(ses);
  if (!ext) {
    // IMPORTANTE: ECE debe existir ANTES de que se carguen las extensiones del
    // usuario. Si se llama aquí con extensiones ya cargadas (path de seguridad),
    // procesarlas retroactivamente para browserAction/popup. Para que los content
    // scripts funcionen (autofill de Bitwarden, etc.) hay que llamar a esta
    // función desde onProfileSessionReady, ANTES de loadExtensionsForProfile.
    ext = new ElectronChromeExtensions({
      license: 'GPL-3.0',
      session: ses,
      ...buildExtensionsImpl(ses),
    });
    extensionsBySession.set(ses, ext);
    attachExtensionShortcutRefresh(ses);
    attachServiceWorkerKeepAlive(ses);

    const eceAny = ext as unknown as Record<string, unknown>;
    const browserAction = (eceAny['api'] as Record<string, unknown> | undefined)?.['browserAction'] as
      | { processExtension?(e: Electron.Extension): void }
      | undefined;
    if (browserAction?.processExtension) {
      for (const loadedExt of ses.extensions.getAllExtensions()) {
        browserAction.processExtension(loadedExt);
      }
    }
  }

  // Cargar extensiones bundled una sola vez por sesión, en cuanto tengamos
  // contexto de ventana para leer las preferencias del usuario (removedByUser).
  if (win && !bundledLoadedForSession.has(ses)) {
    bundledLoadedForSession.add(ses);
    let removedByUser: Set<string> | undefined;
    if (ipcCtx) {
      try {
        const profileId = ipcCtx.profileWindowManager.getProfileForWindow(win.id);
        if (profileId) {
          const repos = ipcCtx.profileManager.getRepositories(profileId);
          const raw = repos.settings.get('extensions:removed-bundled-names');
          if (raw) removedByUser = new Set(JSON.parse(raw) as string[]);
        }
      } catch { /* perfil aún no inicializado, ignorar */ }
    }
    void loadExtensions(ses, removedByUser).then(() => {
      ipcCtx?.events.emit(IPC_EVENTS.EXTENSION_ACTIONS_CHANGED);
    });
  }

  return ext;
}

/**
 * Implementación específica de Vela para los hooks de
 * electron-chrome-extensions. Sin ella, ECE lanza "createTab is not
 * implemented" y las extensiones no pueden abrir pestañas ni ventanas
 * (Bitwarden lo usa para el vault en pestaña, los popouts de reprompt de
 * contraseña, la ayuda, etc.), y `chrome.tabs.remove`/`update({active})`
 * manipulan el WebContents por detrás de `TabManager`, dejando pestañas
 * fantasma en la sidebar.
 *
 * Todos los hooks delegan en `TabManager`, que es la fuente de verdad.
 */
function buildExtensionsImpl(session: Session): {
  createTab: (
    details: chrome.tabs.CreateProperties,
  ) => Promise<[Electron.WebContents, Electron.BaseWindow]>;
  selectTab: (tab: Electron.WebContents, win: Electron.BaseWindow) => void;
  removeTab: (tab: Electron.WebContents, win: Electron.BaseWindow) => void;
  createWindow: (details: chrome.windows.CreateData) => Promise<Electron.BaseWindow>;
  removeWindow: (win: Electron.BaseWindow) => void;
  assignTabDetails: (details: chrome.tabs.Tab, tab: Electron.WebContents) => void;
} {
  /** Perfil al que pertenece la sesión con la que se creó esta instancia. */
  const perfilDeLaVentana = (win: BrowserWindow): string | null =>
    ipcCtx?.profileWindowManager.getProfileForWindow(win.id) ?? null;

  const esDeEstaSesion = (win: BrowserWindow): boolean => {
    const profileId = perfilDeLaVentana(win);
    if (!profileId || !ipcCtx) return false;
    try {
      return ipcCtx.profileManager.getSession(profileId) === session;
    } catch {
      return false;
    }
  };

  /**
   * Ventana normal (no blindada) del MISMO perfil donde materializar lo que
   * pida la extensión: cada perfil tiene su sesión y su copia de la extensión,
   * y abrir la pestaña en otro perfil la dejaría fuera de su alcance.
   */
  const resolveWindow = (windowId?: number): BrowserWindow | null => {
    if (typeof windowId === 'number' && windowId >= 0) {
      const win = BrowserWindow.fromId(windowId);
      if (win && !win.isDestroyed() && !ipcCtx?.tabManager.isBlindedWindow(win.id) && esDeEstaSesion(win)) {
        return win;
      }
    }
    const ultima = getLastActiveWindow();
    if (ultima && esDeEstaSesion(ultima)) return ultima;
    return (
      BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && !ipcCtx?.tabManager.isBlindedWindow(w.id) && esDeEstaSesion(w),
      ) ?? null
    );
  };

  return {
    async createTab(details) {
      if (!ipcCtx) throw new Error('createTab: contexto IPC no inicializado');
      const win = resolveWindow(details.windowId);
      if (!win) throw new Error('createTab: no hay ninguna ventana disponible');
      const workspaceId = ipcCtx.tabManager.getWorkspaceForWindow(win.id);
      if (!workspaceId) throw new Error(`createTab: window ${win.id} sin workspace`);

      const tab = await ipcCtx.tabManager.createTab(win.id, {
        workspaceId,
        parentId: null,
        url: details.url ?? 'vela://newtab',
        // `active` por defecto es true en la API de Chrome.
        activate: details.active !== false,
      });
      // Con `active: false` la pestaña nace descartada (sin WebContentsView);
      // la API de Chrome exige devolver un WebContents, así que la
      // materializamos sin activarla.
      const wc =
        ipcCtx.tabManager.getWcvForTab(tab.id)?.webContents ??
        ipcCtx.tabManager.materializeTab(win.id, tab.id);
      if (!wc) throw new Error('createTab: la pestaña no materializó un WebContents');
      return [wc, win];
    },

    selectTab(tab, win) {
      // ECE también dispara este hook cuando somos NOSOTROS los que le
      // contamos cuál es la activa (ver `applyActiveTabToExtensions`) y
      // cuando observa una pestaña nueva. Actuar ahí activaría en la UI
      // pestañas que Vela acaba de materializar en segundo plano.
      if (sincronizandoTabActiva) return;
      if (!ipcCtx || win.isDestroyed() || tab.isDestroyed()) return;
      const tabId = ipcCtx.tabManager.getTabIdForWebContents(tab.id);
      if (!tabId) return;
      // Ya es la activa: no rebotamos el evento contra TabManager.
      if (ipcCtx.tabManager.getActiveTabWebContents(win.id)?.id === tab.id) return;
      void ipcCtx.tabManager.activateTab(win.id, tabId).catch((err: unknown) => {
        logger.warn('[ext] selectTab: activateTab falló', err);
      });
    },

    removeTab(tab, win) {
      // ECE invoca este hook en dos casos: `chrome.tabs.remove()` (hay que
      // cerrar la pestaña en Vela) y la destrucción del WebContents (Vela ya
      // la cerró; no hay nada que hacer).
      if (!ipcCtx || win.isDestroyed() || tab.isDestroyed()) return;
      const tabId = ipcCtx.tabManager.getTabIdForWebContents(tab.id);
      if (!tabId) return;
      void ipcCtx.tabManager.closeTab(win.id, tabId).catch((err: unknown) => {
        logger.warn('[ext] removeTab: closeTab falló', err);
      });
    },

    async createWindow(details) {
      if (!ipcCtx) throw new Error('createWindow: contexto IPC no inicializado');
      const source = resolveWindow();
      const profileId = source ? perfilDeLaVentana(source) : null;
      if (!profileId) throw new Error('createWindow: no hay perfil activo para esta sesión');
      const win = await ipcCtx.profileWindowManager.openWindow(profileId);
      const url = Array.isArray(details.url) ? details.url[0] : details.url;
      if (url) await openUrlInWindow(win, url);
      return win;
    },

    removeWindow(win) {
      if (!win.isDestroyed()) win.close();
    },

    /**
     * Completa el descriptor de tab con la verdad de `TabManager`. ECE lo
     * deriva de su propio store, que no conoce el árbol de Vela: sin esto,
     * `pinned` e `index` son siempre falsos y `active` depende de un cache
     * que Vela tiene que reescribir a mano.
     */
    assignTabDetails(details, tab) {
      if (!ipcCtx || tab.isDestroyed()) return;
      const info = ipcCtx.tabManager.getExtensionTabInfo(tab.id);
      if (!info) return;
      details.active = info.active;
      details.pinned = info.pinned;
      details.index = info.index;
      details.windowId = info.windowId;
      details.title = info.title ?? details.title;
    },
  };
}

/**
 * Forma interna del store de electron-chrome-extensions. No es API pública,
 * pero necesitamos tocarla para mantener sincronizada la tab activa: ECE marca
 * como activa **toda** tab recién observada (`observeTab` → `onActivated`),
 * incluidas las que Vela materializa en segundo plano.
 */
type EceStore = {
  tabs?: Set<Electron.WebContents>;
  tabToWindow?: WeakMap<Electron.WebContents, BrowserWindow>;
  windowToActiveTab?: WeakMap<BrowserWindow, Electron.WebContents>;
  tabDetailsCache?: Map<number, Record<string, unknown>>;
};

function getEceStore(ext: ElectronChromeExtensions): EceStore | undefined {
  return (ext as unknown as { ctx?: { store?: EceStore } }).ctx?.store;
}

/**
 * Declara ante ECE cuál es la tab activa de una ventana, para que
 * `chrome.tabs.query({ active: true })` devuelva siempre la correcta (autofill
 * de Bitwarden y similares).
 *
 * `selectTab` tiene un early-exit interno: si `windowToActiveTab` ya apunta a
 * este WebContents no refresca `tabDetailsCache`, así que forzamos también la
 * actualización del cache. Importante: solo se tocan las entradas de las tabs
 * de **esta** ventana; marcar el resto como inactivas dejaría a las demás
 * ventanas del mismo perfil sin ninguna tab activa.
 */
function applyActiveTabToExtensions(
  webContents: Electron.WebContents,
  win: BrowserWindow,
): void {
  if (webContents.isDestroyed() || win.isDestroyed()) return;
  sincronizandoTabActiva = true;
  try {
    const ext = getOrCreateExtensions(webContents.session);
    ext.selectTab(webContents);
    const store = getEceStore(ext);
    if (!store?.tabs?.has(webContents)) return;
    const eceWin = store.tabToWindow?.get(webContents) ?? win;
    if (eceWin && !eceWin.isDestroyed()) {
      store.windowToActiveTab?.set(eceWin, webContents);
    }
    // Invalidamos el cache de las pestañas de ESTA ventana en vez de
    // reescribirle el flag: al regenerarse pasa por `assignTabDetails`, que
    // toma los datos de TabManager (la fuente de verdad). Solo las de esta
    // ventana: el cache es por sesión, y vaciar el de las demás dejaría a
    // las otras ventanas del perfil sin pestaña activa.
    for (const tab of store.tabs) {
      if (tab.isDestroyed()) continue;
      const tabWin = store.tabToWindow?.get(tab);
      if (!tabWin || tabWin.isDestroyed() || tabWin.id !== eceWin.id) continue;
      store.tabDetailsCache?.delete(tab.id);
    }
  } catch (err) {
    logger.warn('[ext] sincronización de tab activa falló', err);
  } finally {
    sincronizandoTabActiva = false;
  }
}

/**
 * Reafirma ante ECE la tab activa real de una ventana. Se llama tras adjuntar
 * una tab nueva (ECE la marca activa aunque nazca en segundo plano) y al
 * enfocar la ventana.
 */
function reassertActiveTabToExtensions(win: BrowserWindow): void {
  if (win.isDestroyed() || !ipcCtx) return;
  if (ipcCtx.tabManager.isBlindedWindow(win.id)) return;
  const wc = ipcCtx.tabManager.getActiveTabWebContents(win.id);
  if (!wc || wc.isDestroyed()) return;
  applyActiveTabToExtensions(wc, win);
}

let ipcCtx: IpcContext | null = null;
let commandRegistry: CommandRegistry | null = null;
let shortcutTable: ShortcutTable | null = null;
let gestureRecognizer: GestureRecognizer | null = null;

// Electron no expone "última ventana con foco cuando ninguna tiene foco ahora"
// (p.ej. al recibir una URL externa mientras Vela está en segundo plano), así
// que llevamos nuestro propio orden de recencia por electronId.
const windowFocusOrder: number[] = [];

function trackWindowFocus(window: BrowserWindow): void {
  windowFocusOrder.unshift(window.id);
  window.on('focus', () => {
    const idx = windowFocusOrder.indexOf(window.id);
    if (idx > 0) windowFocusOrder.splice(idx, 1);
    if (idx !== 0) windowFocusOrder.unshift(window.id);
    // Al cambiar de ventana, ECE actualiza su `lastFocusedWindowId` pero no
    // reevalúa qué tab es la activa: si el cache quedó desincronizado, las
    // extensiones consultarían la tab equivocada.
    reassertActiveTabToExtensions(window);
  });
  window.once('closed', () => {
    const idx = windowFocusOrder.indexOf(window.id);
    if (idx !== -1) windowFocusOrder.splice(idx, 1);
  });
}

/** Ventana normal (no blindada) más recientemente activa, para reutilizarla
 * al abrir una URL que llega desde fuera de la app (segunda instancia). */
function getLastActiveWindow(): BrowserWindow | null {
  for (const id of windowFocusOrder) {
    const win = BrowserWindow.fromId(id);
    if (win && !win.isDestroyed() && !ipcCtx?.tabManager.isBlindedWindow(win.id)) {
      return win;
    }
  }
  return (
    BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && !ipcCtx?.tabManager.isBlindedWindow(w.id),
    ) ?? null
  );
}

async function openUrlInWindow(window: BrowserWindow, url: string): Promise<void> {
  if (!ipcCtx) return;
  const workspaceId = ipcCtx.tabManager.getWorkspaceForWindow(window.id);
  if (!workspaceId) {
    logger.warn(`[app] openUrlInWindow: window ${window.id} sin workspace asociado`);
    return;
  }
  await ipcCtx.tabManager.createTab(window.id, { workspaceId, parentId: null, url, activate: true });
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

/** Abre `url` en una nueva pestaña de la última ventana activa; si no hay
 * ninguna ventana abierta, arranca una ventana nueva con esa URL. */
async function openUrlInLastActiveWindow(url: string): Promise<void> {
  const win = getLastActiveWindow();
  if (win) {
    await openUrlInWindow(win, url);
  } else {
    await openStartupWindow({ url });
  }
}

function loadRenderer(window: BrowserWindow): void {
  if (isDev) {
    void window.loadURL(VITE_DEV_SERVER_URL);

    // El listener debe registrarse ANTES de openDevTools para no perder el
    // evento si se dispara en el mismo tick.
    window.webContents.on('devtools-opened', () => {
      setTimeout(() => {
        const dtWC = window.webContents.devToolsWebContents;
        if (!dtWC) return;
        const dtWin = BrowserWindow.fromWebContents(dtWC);
        if (dtWin) {
          try { dtWin.setIcon(getAppIconPath()); } catch { /* ignore */ }
        }
      }, 100);
    });

    window.webContents.openDevTools({ mode: 'detach' });
    return;
  }
  void window.loadFile(RENDERER_INDEX);
}

/**
 * Resuelve el perfil con el que abrir la primera ventana al arrancar (o al
 * reactivar la app en macOS sin ventanas vivas):
 *   1. 'last-active-profile' guardado en app_metadata si todavía existe.
 *   2. Primer perfil no archivado por position.
 * Devuelve null si no hay ningún perfil — el caller debe avisar y abortar
 * (la migración del Prompt 8 garantiza que al menos exista 'default').
 */
function pickStartupProfileId(): string | null {
  if (!ipcCtx) return null;
  const stored = ipcCtx.repositories.appMetadata.get(LAST_ACTIVE_PROFILE_KEY);
  if (stored) {
    const profile = ipcCtx.repositories.profiles.getById(stored);
    if (profile && !profile.archived) return profile.id;
  }
  return ipcCtx.repositories.profiles.list()[0]?.id ?? null;
}

/**
 * Lanza la migración inicial de Fase 3 si la instalación todavía está en el
 * modelo pre-Fase 3 (workspaces/tree_nodes en `vela.db`, sin perfiles). Si la
 * migración falla, mostramos un dialog modal con la ruta de userData y
 * abortamos el arranque sin tocar nada más — el backup queda en
 * `userData/backups/` por si el usuario quiere restaurar a mano.
 */
async function runInitialProfileMigrationIfNeeded(
  ctx: IpcContext,
): Promise<void> {
  const migration = new InitialProfileMigration({
    mainDb: getDb(),
    profileRepo: ctx.repositories.profiles,
    appMetadata: ctx.repositories.appMetadata,
    keyring: ctx.keyring,
    logger,
    bundleExtensionsDir: EXTENSIONS_DIR,
  });
  if (!(await migration.needsMigration())) return;

  logger.info(
    '[app] detectada instalación pre-Fase 3 — ejecutando InitialProfileMigration',
  );
  try {
    await migration.run();
  } catch (err) {
    logger.error('[app] InitialProfileMigration falló — abortando arranque', err);
    const userDataDir = app.getPath('userData');
    const message = err instanceof Error ? err.message : String(err);
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: 'Vela — error al actualizar datos',
      message: 'No se ha podido completar la actualización a la nueva versión.',
      detail:
        `Detalle: ${message}\n\n` +
        `Tus datos originales están a salvo en una copia dentro de:\n${userDataDir}\\backups\n\n` +
        'Cierra Vela y, si el problema persiste, contacta con el desarrollador.',
      buttons: ['Cerrar', 'Abrir carpeta de datos'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (choice === 1) {
      void shell.openPath(userDataDir);
    }
    app.exit(1);
    // El exit cierra el proceso; el throw es para que TypeScript sepa que
    // no se sigue ejecutando el flujo de arranque.
    throw err;
  }
}

async function ensureBootstrapProfile(ctx: IpcContext): Promise<void> {
  if (ctx.repositories.profiles.list().length > 0) return;
  // En instalaciones limpias no hay nada que migrar, así que creamos un perfil
  // "Default" vacío para que la app sea utilizable desde el primer arranque.
  // Las instalaciones existentes pasan por InitialProfileMigration y este
  // bloque no se ejecuta porque ya hay un perfil cuando llegan aquí.
  logger.info('[app] sin perfiles en vela.db; creando "Default" inicial');
  await ctx.profileManager.createProfile({ name: 'Default' });
}

async function openStartupWindow(opts?: { profileId?: string; url?: string }): Promise<BrowserWindow | null> {
  if (!ipcCtx) return null;
  const profileId = opts?.profileId ?? pickStartupProfileId();
  if (!profileId) {
    logger.error('[app] no hay perfiles disponibles; abortando apertura de ventana');
    return null;
  }
  try {
    const window = await ipcCtx.profileWindowManager.openWindow(profileId);
    if (opts?.url) {
      await openUrlInWindow(window, opts.url);
    }
    return window;
  } catch (err) {
    logger.error(`[app] openWindow falló para profile=${profileId}`, err);
    return null;
  }
}

app.whenReady().then(async () => {
  // En Windows, fijar el AUMID antes de mostrar ventanas garantiza que el
  // icono de la barra de tareas se agrupe bajo "Vela" y no bajo "Electron".
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.vela.browser');
    registerWindowsCapabilities();
    // Retira las toasts que quedaron en el Centro de notificaciones de sesiones
    // anteriores: son las que hacen que Windows pinte un badge numérico sobre
    // el icono de la barra de tareas.
    clearWindowsToastHistory('com.vela.browser');
  }

  // Propaga el icono a cualquier BrowserWindow futura (splash, onboarding…).
  app.on('browser-window-created', (_evt, win) => {
    win.once('show', () => {
      try { win.setIcon(getAppIconPath()); } catch { /* ignore */ }
    });
  });

  registerVelaProtocol();
  registerPreviewProtocol();

  initLogger();
  logger.info(`[app] arrancando — versión ${app.getVersion()}, electron ${process.versions['electron']}, chromium ${process.versions['chrome']}`);

  initStorage();

  ipcCtx = buildIpcContext({
    onTabActivated: (webContents, win: BrowserWindow) => {
      if (ipcCtx?.tabManager.isBlindedWindow(win.id)) return;
      if (webContents.isDestroyed()) return;
      applyActiveTabToExtensions(webContents, win);
    },
    onTabAttached: (view: WebContentsView, win: BrowserWindow) => {
      if (!ipcCtx?.tabManager.isBlindedWindow(win.id)) {
        sincronizandoTabActiva = true;
        try {
          getOrCreateExtensions(view.webContents.session, win).addTab(view.webContents, win);
        } finally {
          sincronizandoTabActiva = false;
        }
        // ECE marca activa toda tab recién observada, también las que Vela
        // materializa en segundo plano (restaurar suspendidas, panel no
        // enfocado, restauración de sesión…). Reponemos la activa real.
        reassertActiveTabToExtensions(win);
      }
      if (ipcCtx) attachWebContextMenu(view.webContents, win, ipcCtx);
      if (ipcCtx) {
        attachShortcuts(
          () => shortcutTable,
          ipcCtx,
          view.webContents,
          () => (win.isDestroyed() ? null : win.id),
        );
      }
    },
    onProfileSessionReady: (_profileId, session) => {
      // Con VELA_DEBUG_EXT=1 se vuelca al log la consola de los service
      // workers de las extensiones. Es la única forma de ver qué le pasa al
      // background de una extensión (Bitwarden, uBlock…) sin abrirle DevTools
      // a mano, y resulta imprescindible para diagnosticar fallos que solo
      // reproduce el usuario.
      if (process.env['VELA_DEBUG_EXT'] === '1') {
        session.serviceWorkers.on('console-message', (_e, d: { message?: string; sourceUrl?: string }) => {
          logger.info(`[ext-sw] ${d.sourceUrl ?? ''} :: ${d.message ?? ''}`);
        });
      }
      // Crear ECE para esta sesión ANTES de que ProfileManager llame a
      // loadExtensionsForProfile. Así los eventos extension-loaded de las CRX
      // del usuario (Bitwarden, etc.) son capturados por ECE y los content
      // scripts quedan registrados → autofill y otras funciones funcionan.
      getOrCreateExtensions(session);
    },
    createWindow: (initState) => createMainWindow(initState),
    loadRenderer,
    onWindowOpened: (window) => {
      trackWindowFocus(window);
      if (ipcCtx) {
        attachWindowShortcuts(() => shortcutTable, ipcCtx, window);
      }
      if (ipcCtx) {
        const { events } = ipcCtx;
        const windowId = window.id;
        window.on('maximize', () => {
          events.emit(IPC_EVENTS.WINDOW_MAXIMIZED_CHANGED, { windowId, maximized: true });
        });
        window.on('unmaximize', () => {
          events.emit(IPC_EVENTS.WINDOW_MAXIMIZED_CHANGED, { windowId, maximized: false });
        });
        window.on('enter-full-screen', () => {
          events.emit(IPC_EVENTS.FULLSCREEN_CHANGED, { windowId, fullscreen: true });
        });
        window.on('leave-full-screen', () => {
          events.emit(IPC_EVENTS.FULLSCREEN_CHANGED, { windowId, fullscreen: false });
        });
      }
    },
  });
  await ipcCtx.profileManager.initialize();
  // Limpiar directorios residuales de tabs blindadas de sesiones anteriores.
  void ipcCtx.tabManager.cleanupSecureResidualDirs();
  // Eliminar perfiles temporales de ventanas fantasma que quedaron huérfanos.
  // Criterios: icon === '__blinded__' (nuevo) o name === '__blinded__' (legacy).
  // Si deleteProfile falla (p.ej. archivo bloqueado), forzamos el borrado del
  // registro de la BD para que no sigan apareciendo en el switcher.
  await (async () => {
    const allProfiles = [
      ...ipcCtx!.repositories.profiles.list(),
      ...ipcCtx!.repositories.profiles.listArchived(),
    ];
    const orphans = allProfiles.filter(isBlindedProfile);
    for (const p of orphans) {
      logger.info(`[app] eliminando perfil fantasma huérfano: ${p.id} (${p.name})`);
      try {
        await ipcCtx!.profileManager.deleteProfile(p.id);
      } catch (err) {
        logger.warn(`[app] deleteProfile falló para ${p.id}, forzando borrado del registro`, err);
        try { ipcCtx!.repositories.profiles.delete(p.id); } catch { /* ignorar */ }
      }
    }
  })();
  // La migración inicial de Fase 3 corre ANTES de registrar handlers IPC y
  // abrir cualquier ventana: ningún renderer puede pedir datos mientras
  // estamos copiando workspaces/tree_nodes a profile.db. Si falla, el
  // helper dispara dialog modal y aborta el arranque.
  await runInitialProfileMigrationIfNeeded(ipcCtx);
  registerAllHandlers(ipcCtx);

  gestureRecognizer = new GestureRecognizer(ipcCtx);

  commandRegistry = new CommandRegistry();
  registerCoreCommands(commandRegistry, { ipc: ipcCtx });
  gestureRecognizer.setCommandRegistry(commandRegistry);

  const getCustomShortcuts = (): Record<string, string | null> => {
    const raw = ipcCtx!.repositories.appMetadata.get('shortcuts:custom');
    if (!raw) return {};
    try { return JSON.parse(raw) as Record<string, string | null>; }
    catch { return {}; }
  };

  const getWorkspaceModifier = (): 'ctrl' | 'alt' => {
    const val = new GlobalSettings(ipcCtx!.repositories.appMetadata)
      .get<'ctrl' | 'alt'>('workspaces:switch-modifier');
    return val === 'ctrl' ? 'ctrl' : 'alt';
  };

  const buildTable = (): ShortcutTable => {
    const table = buildShortcutTable(
      commandRegistry!,
      ipcCtx!,
      getCustomShortcuts(),
      getWorkspaceModifier(),
    );
    // Los atajos declarados por las extensiones van DESPUÉS de los de Vela:
    // ante un combo ya ocupado, la extensión se queda sin atajo.
    registerExtensionShortcuts(
      table,
      extensionsBySession.keys(),
      (ses) => extensionsBySession.get(ses),
      ipcCtx!,
    );
    return table;
  };

  shortcutTable = buildTable();

  const refreshShortcuts = (): void => {
    shortcutTable = buildTable();
    logger.info('[shortcuts] tabla reconstruida');
  };

  ipcCtx.events.on(IPC_EVENTS.SHORTCUTS_SYSTEM_CHANGED, refreshShortcuts);
  // Las extensiones se cargan de forma asíncrona y el usuario puede instalarlas
  // o quitarlas en caliente; `attachExtensionShortcutRefresh` rehace la tabla
  // cuando cambia el conjunto cargado en cualquier sesión.
  refreshExtensionShortcuts = refreshShortcuts;
  for (const ses of extensionsBySession.keys()) attachExtensionShortcutRefresh(ses);

  registerShortcutsHandlers(
    ipcCtx,
    commandRegistry,
    refreshShortcuts,
    () => getSystemCombos(getWorkspaceModifier()),
  );
  registerCommandsHandlers(ipcCtx, commandRegistry);

  logger.info(
    `[commands] registrados ${commandRegistry.list().length} comandos: ${commandRegistry
      .list()
      .map((c) => `${c.id}${c.defaultShortcut ? `(${c.defaultShortcut})` : ''}`)
      .join(', ')}`,
  );

  await ensureBootstrapProfile(ipcCtx);

  // Procesar args de jump list en el arranque inicial (cuando Vela no estaba abierto).
  const startupArgs = parseJumpListArgs(process.argv);
  if (startupArgs.privateWindow) {
    await ipcCtx.profileWindowManager.openBlindedWindow(startupArgs.url ?? undefined);
  } else {
    await openStartupWindow({ profileId: startupArgs.profileId, url: startupArgs.url ?? undefined });
  }

  // Jump list de Windows: categoría de perfiles + tareas rápidas.
  const refreshJumpList = (): void => {
    if (!ipcCtx || process.platform !== 'win32') return;
    try {
      buildJumpList(ipcCtx.repositories.profiles.list());
    } catch (err) {
      logger.warn('[jumplist] error al actualizar jump list', err);
    }
  };

  refreshJumpList();
  ipcCtx.events.on(IPC_EVENTS.PROFILES_CHANGED, refreshJumpList);

  // Limpieza periódica de previews huérfanas (tabs cerradas cuyo .webp quedó
  // en disco tras un crash o error de ciclo de vida).
  setInterval(() => {
    ipcCtx!.tabManager.cleanupPreviewOrphans().catch((err: unknown) => {
      logger.warn('[preview] cleanupPreviewOrphans falló', err);
    });
  }, 60 * 60 * 1000);

  // Job diario: expira entradas de historial según el periodo de retención por perfil.
  function runHistoryExpiration(): void {
    const ctx = ipcCtx;
    if (!ctx) return;
    try {
      const profiles = ctx.repositories.profiles.list();
      for (const profile of profiles) {
        try {
          if (!ctx.profileManager.isOpen(profile.id)) continue;
          const repos = ctx.profileManager.getRepositories(profile.id);
          let retention = 'forever';
          try {
            const raw = repos.settings.get('history:retention');
            if (raw) retention = JSON.parse(raw) as string;
          } catch { /* default */ }
          if (retention === 'forever') continue;
          const retentionMs: Record<string, number> = {
            week: 7 * 24 * 60 * 60 * 1000,
            month: 30 * 24 * 60 * 60 * 1000,
            '3months': 90 * 24 * 60 * 60 * 1000,
            '6months': 180 * 24 * 60 * 60 * 1000,
          };
          const ms = retentionMs[retention];
          if (!ms) continue;
          const cutoff = Date.now() - ms;
          repos.history.deleteOlderThan(cutoff);
          logger.info(`[history] expiradas entradas anteriores a ${new Date(cutoff).toISOString()} en perfil ${profile.id}`);
        } catch (err) {
          logger.warn(`[history] expiración falló en perfil ${profile.id}`, err);
        }
      }
    } catch (err) {
      logger.warn('[history] runHistoryExpiration falló', err);
    }
  }

  runHistoryExpiration();
  setInterval(runHistoryExpiration, 24 * 60 * 60 * 1000);

  const discardManager = new DiscardManager({
    tabManager: ipcCtx.tabManager,
    profileManager: ipcCtx.profileManager,
    logger,
  });
  discardManager.start();

  app.on('before-quit', () => discardManager.stop());

  initUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void openStartupWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  logger.info('[app] cerrando — flushing storage y logs');
  shutdownUpdater();
  if (ipcCtx) {
    ipcCtx.profileWindowManager.dispose();
    ipcCtx.profileManager.shutdownSync();
  }
  closeStorage();
  closeLogger();
});

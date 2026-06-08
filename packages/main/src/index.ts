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
    void ipcCtx?.profileWindowManager.openBlindedWindow().catch((err: unknown) => {
      logger.warn('[app] openBlindedWindow (second-instance) falló', err);
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

function getOrCreateExtensions(ses: Session, win?: BrowserWindow): ElectronChromeExtensions {
  let ext = extensionsBySession.get(ses);
  if (!ext) {
    // IMPORTANTE: ECE debe existir ANTES de que se carguen las extensiones del
    // usuario. Si se llama aquí con extensiones ya cargadas (path de seguridad),
    // procesarlas retroactivamente para browserAction/popup. Para que los content
    // scripts funcionen (autofill de Bitwarden, etc.) hay que llamar a esta
    // función desde onProfileSessionReady, ANTES de loadExtensionsForProfile.
    ext = new ElectronChromeExtensions({ license: 'GPL-3.0', session: ses });
    extensionsBySession.set(ses, ext);

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

let ipcCtx: IpcContext | null = null;
let commandRegistry: CommandRegistry | null = null;
let shortcutTable: ShortcutTable | null = null;
let gestureRecognizer: GestureRecognizer | null = null;
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

async function openStartupWindow(opts?: { profileId?: string }): Promise<BrowserWindow | null> {
  if (!ipcCtx) return null;
  const profileId = opts?.profileId ?? pickStartupProfileId();
  if (!profileId) {
    logger.error('[app] no hay perfiles disponibles; abortando apertura de ventana');
    return null;
  }
  try {
    return await ipcCtx.profileWindowManager.openWindow(profileId);
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
    onTabAttached: (view: WebContentsView, win: BrowserWindow) => {
      if (!ipcCtx?.tabManager.isBlindedWindow(win.id)) {
        getOrCreateExtensions(view.webContents.session, win).addTab(view.webContents, win);
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
      // Crear ECE para esta sesión ANTES de que ProfileManager llame a
      // loadExtensionsForProfile. Así los eventos extension-loaded de las CRX
      // del usuario (Bitwarden, etc.) son capturados por ECE y los content
      // scripts quedan registrados → autofill y otras funciones funcionan.
      getOrCreateExtensions(session);
    },
    createWindow: (initState) => createMainWindow(initState),
    loadRenderer,
    onWindowOpened: (window) => {
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

  shortcutTable = buildShortcutTable(commandRegistry, ipcCtx, getCustomShortcuts(), getWorkspaceModifier());

  const refreshShortcuts = (): void => {
    shortcutTable = buildShortcutTable(commandRegistry!, ipcCtx!, getCustomShortcuts(), getWorkspaceModifier());
    logger.info('[shortcuts] tabla reconstruida');
  };

  ipcCtx.events.on(IPC_EVENTS.SHORTCUTS_SYSTEM_CHANGED, refreshShortcuts);

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
    await ipcCtx.profileWindowManager.openBlindedWindow();
  } else {
    await openStartupWindow({ profileId: startupArgs.profileId });
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

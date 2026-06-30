import path from 'node:path';
import {
  app,
  BrowserWindow,
  WebContentsView,
  type Session,
  type WebContents,
} from 'electron';
import { SecureTabManager } from '../security/SecureTabManager';
import { getAppIconPath } from '../window/iconPath';
import { ensureVelaProtocolOnSession } from '../protocols/velaProtocol';
import { ensurePreviewProtocolOnSession } from '../protocols/previewProtocol';
import {
  IPC_EVENTS,
  type TabNode,
  type TabRuntime,
  type WindowLayout,
  type LayoutMode,
  type PanelId,
  type RecentlyClosedTab,
  type UserScript,
} from '@vela/shared';
import type { MainEventBus } from '../ipc/events';
import { InvariantViolationError, NotFoundError } from '../lib/errors';
import { MruStack } from '../lib/MruStack';
import { positionsAtEnd } from '../lib/tree';
import { applyRulesToTab } from '../groups/autoGrouping';
import type { Logger } from '../logger';
import type { ProfileManager, ProfileRepositories } from '../profiles/ProfileManager';
import { PreviewStore } from '../previews/PreviewStore';
import { PreviewCapturer, type CaptureSettings } from '../previews/PreviewCapturer';

export const SIDEBAR_WIDTH_DEFAULT = 240;
export const SIDEBAR_WIDTH_COMPACT = 56;
// Altura por defecto de la barra de direcciones. Coincide con la altura en
// modo normal del renderer (`AddressBar.tsx`); evita que el WCV se materialice
// pegado a y=0 antes de que el renderer reporte la altura real vía
// `layout:set-address-bar-height`. Si el sidebar está en modo compacto, el
// renderer ajusta a 32 al montar.
export const ADDRESS_BAR_HEIGHT_DEFAULT = 40;
const HIDDEN_BOUNDS = { x: -20000, y: 0, width: 1, height: 1 } as const;

// Electron emite ABORTED (-3) cuando se navega muy rápido a otra URL o se
// cancela una carga. No es un fallo real.
const ERR_ABORTED = -3;

// Preload expuesto a páginas internas (vela://). main compila a un bundle
// único en packages/main/dist/index.js, por lo que __dirname = packages/main/dist/.
const INTERNAL_PRELOAD_PATH = path.join(
  __dirname,
  '../../preload/dist/index.js',
);
// Preload mínimo para contenido web externo (userscripts, hover, etc.).
const WEB_TAB_PRELOAD_PATH = path.join(
  __dirname,
  '../../preload/dist/webTab.js',
);

// Pila MRU cross-window/cross-workspace. Se persiste y agrupa todos los
// workspaces del perfil — vive en profile_metadata, no en app_metadata,
// porque los tabIds que contiene solo existen en ese perfil.
const GLOBAL_MRU_KEY = 'mru:stack-global';
const GLOBAL_MRU_LIMIT = 200;

export interface TabManagerCtx {
  profileManager: ProfileManager;
  events: MainEventBus;
  logger: Logger;
  /** Hook para integrar el WCV con sistemas externos (p.ej. extensiones). */
  onTabAttached?: (view: WebContentsView, window: BrowserWindow) => void;
  /** Hook llamado al terminar de cablear listeners en un WCV (media, etc.). */
  onTabViewWired?: (tabId: string, view: WebContentsView, windowId: number, profileId: string) => void;
  /**
   * Hook llamado cuando cambia la tab activa de una ventana, para notificar al
   * sistema de extensiones (ECE `selectTab`). Sin esto, `chrome.tabs.query`
   * ({active:true}) de las extensiones (Bitwarden, etc.) devuelve siempre la
   * primera tab materializada de la ventana, no la realmente activa.
   */
  onTabActivated?: (webContents: WebContents, window: BrowserWindow) => void;
  /** Hook llamado al crear la sesión de una tab blindada para cargar extensiones permitidas. */
  onSecureSessionReady?: (profileId: string, repos: ProfileRepositories, secureSession: Session) => Promise<void>;
}

export interface CreateTabInput {
  workspaceId: string;
  parentId: string | null;
  url: string;
  activate?: boolean;
  panelId?: PanelId;
}

interface PerWindow {
  windowId: number;
  window: BrowserWindow;
  workspaceId: string;
  /**
   * Perfil al que pertenece la ventana. Estable durante toda su vida (cambiar
   * de perfil requiere abrir nueva ventana, ver Fase 3 ADR). Tras Prompt 6 es
   * obligatorio: cualquier window registrada en TabManager pertenece a un
   * perfil concreto, y a partir de él se obtienen los repositorios.
   */
  profileId: string;
  tabs: Map<string, WebContentsView>;
  activeTabId: string | null;
  mru: MruStack<string>;
  /**
   * Estado de navegación efímera Ctrl+Tab. Se inicia al primer Ctrl+Tab,
   * se cancela/confirma al soltar Ctrl. Mientras está activo, los cambios
   * de tab visible no se persisten ni alteran la pila MRU; solo en el
   * commit se hace push real.
   */
  mruNav: { baseline: readonly string[]; cursorIndex: number } | null;
  sidebarWidth: number;
  /**
   * Altura reservada para la barra de direcciones encima del área del WCV
   * (renderer-driven). Se actualiza vía `layout:set-address-bar-height` en
   * cada cambio de modo compacto/normal y al montar la barra. Si la barra
   * no estuviera renderizada, el renderer envía 0 y el WCV ocupa toda el
   * área a la derecha del sidebar.
   */
  addressBarHeight: number;
  /**
   * Cuando es true, el WCV activo se oculta para que el renderer pueda
   * dibujar overlays (modal, dropdown que se sale del sidebar) por
   * encima de lo que sería el área de la pestaña. La jerarquía de
   * contentView.addChildView no permite poner el renderer encima del
   * WCV, así que la solución es esconderlo temporalmente.
   */
  overlayActive: boolean;
  /** Ancho reservado en el borde derecho para el panel de notificaciones (0 = cerrado). */
  notificationPanelWidth: number;
  /** Emulación de dispositivo activa en la tab activa de esta ventana. */
  deviceEmulation: { width: number; height: number; dpr: number; mobile: boolean; backgroundColor: string } | null;
  resizeHandler: () => void;
  closeHandler: () => void;
  // --- Split View ---
  layoutMode: LayoutMode;
  splitRatio: number;
  focusedPanelId: PanelId;
  /** panelId → tabId activo en ese panel (solo los paneles visibles). */
  panelTabIds: Map<PanelId, string>;
}

interface SuspendedState {
  tabs: Map<string, WebContentsView>;
  activeTabId: string | null;
  mru: MruStack<string>;
  mruNav: { baseline: readonly string[]; cursorIndex: number } | null;
}

function lastActiveTabKey(workspaceId: string): string {
  return `last-active-tab-${workspaceId}`;
}

const PREVIEW_DIMENSIONS: Record<string, [number, number]> = {
  low: [240, 150],
  medium: [320, 200],
  high: [480, 300],
};

function resolveInitialSidebarWidth(repos: ProfileRepositories): number {
  try {
    const rawOpen = repos.settings.get('ui:sidebarOpen');
    const sidebarOpen: boolean = rawOpen !== null ? JSON.parse(rawOpen) !== false : true;
    if (!sidebarOpen) return 0;

    const rawMode = repos.settings.get('ui:sidebarMode');
    const sidebarMode: string = rawMode !== null ? JSON.parse(rawMode) : 'normal';
    if (sidebarMode === 'compact') return SIDEBAR_WIDTH_COMPACT;

    const rawWidth = repos.settings.get('ui:sidebarWidth');
    const width = rawWidth !== null ? Number(rawWidth) : NaN;
    return isFinite(width) && width > 0 ? width : SIDEBAR_WIDTH_DEFAULT;
  } catch {
    return SIDEBAR_WIDTH_DEFAULT;
  }
}

export class TabManager {
  private readonly windows = new Map<number, PerWindow>();
  private readonly tabToWindow = new Map<string, number>();
  /** UUID generado al arrancar la app; cambia en cada reinicio para agrupar visitas por sesión en historial. */
  private readonly sessionId = crypto.randomUUID();
  // Pilas MRU globales por perfil. Cada perfil tiene su propia pila porque
  // los tabIds solo existen dentro de su profile.db. Se persisten en
  // profile_metadata para que Ctrl+Tab en modo 'global' recuerde el orden
  // tras cerrar la app.
  private readonly globalMruByProfile = new Map<string, MruStack<string>>();
  private readonly mruLoaded = new Set<string>();
  private readonly readerStateByTab = new Map<string, { readable: boolean }>();
  private readonly pageFeatsByTab = new Map<string, Array<'rss' | 'form' | 'media'>>();
  // Tabs cuyo formulario tiene datos introducidos por el usuario sin enviar.
  // Lo reporta el preload (webTab.ts) vía 'form-dirty:changed'. El DiscardManager
  // lo consulta para no suspender una tab que el usuario está rellenando.
  private readonly dirtyFormsByTab = new Set<string>();
  private readonly previewStores = new Map<string, PreviewStore>();
  private readonly previewCapturers = new Map<string, PreviewCapturer>();
  private readonly recentlyClosed = new Map<number, RecentlyClosedTab[]>();
  // Tabs suspendidas al cambiar de workspace (sin descartar). Clave: `${windowId}:${workspaceId}`.
  private readonly suspendedWorkspaces = new Map<string, SuspendedState>();
  // IDs de tabs blindadas (en memoria; no se persisten al reiniciar).
  private readonly secureTabs = new Set<string>();
  // IDs de ventanas blindadas: todas sus pestañas se crean como seguras automáticamente.
  private readonly blindedWindows = new Set<number>();
  private readonly secureTabManager: SecureTabManager;

  constructor(private readonly ctx: TabManagerCtx) {
    this.secureTabManager = new SecureTabManager(ctx.logger);
  }

  /** Elimina directorios temporales de tabs blindadas de sesiones anteriores. */
  async cleanupSecureResidualDirs(): Promise<void> {
    await this.secureTabManager.cleanupResidualDirs();
  }

  /** Número total de tabs blindadas abiertas en todas las ventanas. */
  getSecureTabCount(): number {
    return this.secureTabs.size;
  }

  /** Marca una ventana como blindada: todas sus pestañas nuevas serán seguras. */
  markWindowAsBlinded(electronWindowId: number): void {
    this.blindedWindows.add(electronWindowId);
  }

  /** Devuelve true si la ventana está marcada como blindada. */
  isBlindedWindow(electronWindowId: number): boolean {
    return this.blindedWindows.has(electronWindowId);
  }

  getReaderState(tabId: string): { readable: boolean } | null {
    return this.readerStateByTab.get(tabId) ?? null;
  }

  getTabIdForWebContents(webContentsId: number): string | null {
    for (const [, state] of this.windows) {
      for (const [tabId, view] of state.tabs) {
        if (view.webContents.id === webContentsId) return tabId;
      }
    }
    return null;
  }

  getWindowIdForTab(tabId: string): number | null {
    return this.tabToWindow.get(tabId) ?? null;
  }

  // ---------- ciclo de vida de ventanas ----------

  attachWindow(
    window: BrowserWindow,
    workspaceId: string,
    profileId: string,
  ): void {
    const windowId = window.id;
    if (this.windows.has(windowId)) {
      this.ctx.logger.warn(
        `[tabs] attachWindow: window ${windowId} ya estaba registrada`,
      );
      return;
    }

    const repos = this.ctx.profileManager.getRepositories(profileId);
    const ws = repos.workspaces.getById(workspaceId);
    if (!ws) throw new NotFoundError('Workspace', workspaceId);
    this.ensureGlobalMruLoaded(profileId, repos);

    const initialSidebarWidth = resolveInitialSidebarWidth(repos);

    const state: PerWindow = {
      windowId,
      window,
      workspaceId,
      profileId,
      tabs: new Map(),
      activeTabId: null,
      mru: new MruStack<string>(),
      mruNav: null,
      sidebarWidth: initialSidebarWidth,
      addressBarHeight: ADDRESS_BAR_HEIGHT_DEFAULT,
      overlayActive: false,
      notificationPanelWidth: 0,
      deviceEmulation: null,
      resizeHandler: () => this.recalculateBounds(windowId),
      closeHandler: () => this.detachWindow(windowId),
      layoutMode: 'single',
      splitRatio: 0.5,
      focusedPanelId: 'left',
      panelTabIds: new Map(),
    };

    window.on('resize', state.resizeHandler);
    window.once('closed', state.closeHandler);
    this.windows.set(windowId, state);

    this.ctx.logger.info(
      `[tabs] window ${windowId} attached a workspace=${workspaceId} profile=${profileId}`,
    );

    if (!this.blindedWindows.has(windowId)) {
      try {
        this.restoreOnStartup(windowId, workspaceId);
      } catch (err) {
        this.ctx.logger.error(
          `[tabs] restoreOnStartup falló para window=${windowId} workspace=${workspaceId}`,
          err,
        );
      }
    }
  }

  detachWindow(windowId: number): void {
    const state = this.windows.get(windowId);
    if (!state) return;

    if (!state.window.isDestroyed()) {
      state.window.removeListener('resize', state.resizeHandler);
      state.window.removeListener('closed', state.closeHandler);
    }

    for (const [tabId, view] of state.tabs) {
      if (this.secureTabs.has(tabId)) {
        void this.secureTabManager.closeTab(tabId);
        this.secureTabs.delete(tabId);
      }
      this.tabToWindow.delete(tabId);
      this.destroyView(state, view);
    }
    state.tabs.clear();
    state.mru.clear();
    state.mruNav = null;
    state.activeTabId = null;

    // Destruir WCVs suspendidos de esta ventana
    for (const [key, suspended] of this.suspendedWorkspaces) {
      if (key.startsWith(`${windowId}:`)) {
        for (const [tabId, view] of suspended.tabs) {
          if (this.secureTabs.has(tabId)) {
            void this.secureTabManager.closeTab(tabId);
            this.secureTabs.delete(tabId);
          }
          const wc1 = view.webContents;
          if (wc1 && !wc1.isDestroyed()) {
            try { wc1.close(); } catch { /* ignorar */ }
          }
        }
        this.suspendedWorkspaces.delete(key);
      }
    }

    this.windows.delete(windowId);
    this.blindedWindows.delete(windowId);

    this.ctx.logger.info(`[tabs] window ${windowId} detached`);
  }

  setWorkspaceForWindow(windowId: number, newWorkspaceId: string): void {
    const state = this.requireWindow(windowId);
    if (state.workspaceId === newWorkspaceId) return;

    const repos = this.reposFor(state);
    const newWs = repos.workspaces.getById(newWorkspaceId);
    if (!newWs) throw new NotFoundError('Workspace', newWorkspaceId);

    const previousWorkspaceId = state.workspaceId;

    const discardOnSwitch = (() => {
      try {
        const raw = repos.settings.get('tabs:discard-on-workspace-switch');
        return raw !== null ? (JSON.parse(raw) as boolean) : false;
      } catch {
        return false;
      }
    })();

    if (discardOnSwitch) {
      this.discardAllTabsOf(state, { markDiscarded: true });
    } else {
      this.suspendTabsOf(state, previousWorkspaceId);
    }

    state.layoutMode = 'single';
    state.panelTabIds.clear();
    state.focusedPanelId = 'left';
    state.workspaceId = newWorkspaceId;

    this.ctx.events.emit(IPC_EVENTS.ACTIVE_TAB_CHANGED, {
      windowId,
      tabId: null,
    });

    try {
      if (!discardOnSwitch && this.restoreSuspended(windowId, newWorkspaceId)) {
        // Restaurado desde memoria; no hace falta restoreOnStartup
      } else {
        this.restoreOnStartup(windowId, newWorkspaceId);
      }
    } catch (err) {
      this.ctx.logger.error(
        `[tabs] restore falló al cambiar a workspace=${newWorkspaceId} (window=${windowId})`,
        err,
      );
    }

    // Restaurar el layout guardado del nuevo workspace
    try {
      this.restoreLayoutForWorkspace(windowId, newWorkspaceId);
    } catch (err) {
      this.ctx.logger.warn('[layout] restoreLayoutForWorkspace falló', err);
    }

    this.ctx.logger.info(
      `[tabs] window ${windowId} cambia workspace ${previousWorkspaceId} → ${newWorkspaceId}`,
    );
  }

  /**
   * Limpia todos los WCV del workspace dado en cualquier window. Se llama
   * antes de borrar el workspace en DB para evitar que el TabManager
   * quede con referencias a tabs que dejarán de existir por CASCADE.
   * El caller es responsable de hacer setWorkspaceForWindow después si
   * la window quedaba apuntando al workspace borrado.
   */
  cleanupWorkspaceTabs(workspaceId: string): void {
    // Destruir WCVs suspendidos del workspace que se va a borrar
    for (const [key, suspended] of this.suspendedWorkspaces) {
      if (key.endsWith(`:${workspaceId}`)) {
        for (const view of suspended.tabs.values()) {
          const wc2 = view.webContents;
          if (wc2 && !wc2.isDestroyed()) {
            try { wc2.close(); } catch { /* ignorar */ }
          }
        }
        this.suspendedWorkspaces.delete(key);
      }
    }

    const affectedProfiles = new Set<string>();
    for (const state of this.windows.values()) {
      if (state.workspaceId !== workspaceId) continue;
      this.discardAllTabsOf(state, { markDiscarded: false });
      affectedProfiles.add(state.profileId);
      this.ctx.events.emit(IPC_EVENTS.ACTIVE_TAB_CHANGED, {
        windowId: state.windowId,
        tabId: null,
      });
    }
    // El workspace está a punto de borrarse (CASCADE eliminará sus tabs);
    // limpiamos la pila MRU global del/los perfil(es) afectados para no
    // dejar referencias huérfanas. Si workspaceId no estaba en ninguna
    // window viva, no hay nada que limpiar.
    for (const profileId of affectedProfiles) {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      const stack = this.globalStackFor(profileId);
      let removedAny = false;
      for (const tabId of stack.toArray()) {
        const node = repos.treeNodes.getById(tabId);
        if (node && node.kind === 'tab' && node.workspaceId === workspaceId) {
          stack.remove(tabId);
          removedAny = true;
        }
      }
      if (removedAny) this.persistGlobalMruStack(profileId);
    }
  }

  private discardAllTabsOf(
    state: PerWindow,
    opts: { markDiscarded: boolean },
  ): void {
    let repos: ProfileRepositories | null = null;
    if (opts.markDiscarded) {
      try {
        repos = this.reposFor(state);
      } catch {
        // Si el perfil ya no está abierto, no podemos persistir discarded;
        // los WCV se siguen destruyendo igual. Suficiente para detach.
      }
    }
    for (const [tabId, view] of state.tabs) {
      this.tabToWindow.delete(tabId);
      this.destroyView(state, view);
      if (repos) {
        try {
          const node = repos.treeNodes.getById(tabId);
          if (node) {
            repos.treeNodes.update(tabId, { discarded: true });
          }
        } catch (err) {
          this.ctx.logger.warn(
            `[tabs] mark discarded falló (tab=${tabId})`,
            err,
          );
        }
      }
    }
    state.tabs.clear();
    state.mru.clear();
    state.mruNav = null;
    state.activeTabId = null;
  }

  private suspendTabsOf(state: PerWindow, workspaceId: string): void {
    for (const [tabId, view] of state.tabs) {
      this.tabToWindow.delete(tabId);
      try {
        if (!state.window.isDestroyed()) {
          state.window.contentView.removeChildView(view);
        }
      } catch (err) {
        this.ctx.logger.warn('[tabs] removeChildView (suspend) falló', err);
      }
    }
    const key = `${state.windowId}:${workspaceId}`;
    this.suspendedWorkspaces.set(key, {
      tabs: new Map(state.tabs),
      activeTabId: state.activeTabId,
      mru: state.mru,
      mruNav: state.mruNav,
    });
    state.tabs.clear();
    state.mru = new MruStack<string>();
    state.mruNav = null;
    state.activeTabId = null;
  }

  private restoreSuspended(windowId: number, workspaceId: string): boolean {
    const key = `${windowId}:${workspaceId}`;
    const suspended = this.suspendedWorkspaces.get(key);
    if (!suspended) return false;

    const state = this.windows.get(windowId);
    if (!state) return false;

    this.suspendedWorkspaces.delete(key);

    const survivingTabs = new Map<string, WebContentsView>();
    for (const [tabId, view] of suspended.tabs) {
      if (!view.webContents || view.webContents.isDestroyed()) {
        continue;
      }
      try {
        if (!state.window.isDestroyed()) {
          state.window.contentView.addChildView(view);
          view.setBounds({ x: -20000, y: 0, width: 1, height: 1 });
        }
        survivingTabs.set(tabId, view);
        this.tabToWindow.set(tabId, windowId);
      } catch (err) {
        this.ctx.logger.warn('[tabs] addChildView (restore) falló', err);
      }
    }

    if (survivingTabs.size === 0) return false;

    state.tabs = survivingTabs;
    state.mru = suspended.mru;
    state.mruNav = suspended.mruNav;

    const restoredActiveId =
      suspended.activeTabId && survivingTabs.has(suspended.activeTabId)
        ? suspended.activeTabId
        : survivingTabs.keys().next().value ?? null;
    state.activeTabId = restoredActiveId;

    this.recalculateBounds(windowId);

    this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, { workspaceId });
    this.ctx.events.emit(IPC_EVENTS.ACTIVE_TAB_CHANGED, {
      windowId,
      tabId: restoredActiveId,
    });

    this.ctx.logger.info(
      `[tabs] workspace ${workspaceId} restaurado desde memoria (${survivingTabs.size} tabs)`,
    );
    return true;
  }

  // ---------- API pública ----------

  async createTab(
    windowId: number,
    input: CreateTabInput,
  ): Promise<TabNode> {
    // En ventanas blindadas todas las pestañas son seguras por definición.
    if (this.blindedWindows.has(windowId)) {
      const secureId = await this.createSecureTab(windowId, input.url);
      const st = this.requireWindow(windowId);
      const node = this.reposFor(st).treeNodes.getById(secureId);
      return (node?.kind === 'tab' ? node : { id: secureId }) as TabNode;
    }

    const state = this.requireWindow(windowId);
    const repos = this.reposFor(state);
    const activate = input.activate ?? true;

    const tab = repos.treeNodes.createTab({
      workspaceId: input.workspaceId,
      parentId: input.parentId,
      url: input.url,
      originalTitle: '',
      discarded: !activate,
      lastActiveAt: activate ? Date.now() : null,
    });

    // Pre-poblar favicon desde historial para URLs ya visitadas, de modo
    // que el tab muestre el icono correcto antes de que page-favicon-updated
    // dispare (tabs discarded o recién creadas).
    if (input.url && !input.url.startsWith('vela://') && !input.url.startsWith('about:')) {
      const cachedFavicon = repos.history.getFaviconForUrl(input.url);
      if (cachedFavicon) {
        repos.treeNodes.update(tab.id, { favicon: cachedFavicon });
      }
    }

    if (activate) {
      this.spawnView(state, tab);
      this.activateInternal(state, tab.id, { panelId: input.panelId });
    }

    this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
      workspaceId: tab.workspaceId,
    });

    // Auto-grouping: si la tab queda en raíz y no es pinned, la primera
    // regla del workspace que coincida la mueve a la carpeta destino.
    this.applyAutoGroupRules(state, tab.id);

    return tab;
  }

  async createSecureTab(windowId: number, url?: string): Promise<string> {
    const state = this.requireWindow(windowId);
    const repos = this.reposFor(state);

    const tab = repos.treeNodes.createTab({
      workspaceId: state.workspaceId,
      parentId: null,
      url: url ?? 'about:blank',
      originalTitle: '',
      discarded: false,
      lastActiveAt: Date.now(),
      isSecure: true,
    });

    const secureSession = await this.secureTabManager.setupTab(tab.id);
    this.secureTabs.add(tab.id);

    if (this.ctx.onSecureSessionReady) {
      try {
        await this.ctx.onSecureSessionReady(state.profileId, repos, secureSession);
      } catch (err) {
        this.ctx.logger.warn('[secure] onSecureSessionReady falló', err);
      }
    }

    this.spawnSecureView(state, tab, secureSession);
    this.activateInternal(state, tab.id, {});

    this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
      workspaceId: tab.workspaceId,
    });

    this.ctx.logger.info(`[secure] tab blindada creada: ${tab.id}`);
    return tab.id;
  }

  async activateTab(windowId: number, tabId: string, panelId?: PanelId): Promise<void> {
    const state = this.requireWindow(windowId);
    const repos = this.reposFor(state);
    const node = repos.treeNodes.getById(tabId);
    if (!node) throw new NotFoundError('Node', tabId);
    if (node.kind !== 'tab') {
      throw new InvariantViolationError(`activateTab: ${tabId} no es una tab`);
    }
    if (node.workspaceId !== state.workspaceId && !node.anchored) {
      throw new InvariantViolationError(
        `activateTab: la tab ${tabId} (workspace=${node.workspaceId}) no pertenece al workspace de la window ${windowId} (workspace=${state.workspaceId})`,
      );
    }

    // Hook 1: capturar la tab saliente antes de ocultarla (no para tabs blindadas).
    const prevTabId = state.activeTabId;
    if (prevTabId && prevTabId !== tabId && !this.secureTabs.has(prevTabId)) {
      const prevView = state.tabs.get(prevTabId);
      const prevWc = prevView?.webContents;
      if (prevWc && !prevWc.isDestroyed()) {
        const { capturer } = this.ensurePreviewComponents(state.profileId);
        capturer.capture(prevTabId, prevWc).catch(() => {});
      }
    }

    let view = state.tabs.get(tabId);
    if (!view) {
      view = this.spawnView(state, node);
      if (node.discarded) {
        repos.treeNodes.update(tabId, { discarded: false });
      }
    }
    this.activateInternal(state, tabId, { panelId });
  }

  async closeTab(windowId: number, tabId: string): Promise<void> {
    const state = this.requireWindow(windowId);
    const repos = this.reposFor(state);
    const node = repos.treeNodes.getById(tabId);

    // Save to recently-closed buffer before deletion (max 10 per window, FIFO).
    // Excludes transient/blank pages; internal vela:// pages like settings are kept.
    if (node && node.kind === 'tab' &&
        node.url &&
        node.url !== 'about:blank' &&
        node.url !== 'vela://newtab') {
      const stack = this.recentlyClosed.get(windowId) ?? [];
      stack.unshift({
        tabId: node.id,
        url: node.url,
        title: node.name ?? node.originalTitle ?? node.url,
        favicon: node.favicon ?? null,
        workspaceId: node.workspaceId,
        closedAt: Date.now(),
      });
      if (stack.length > 10) stack.pop();
      this.recentlyClosed.set(windowId, stack);
    }

    const view = state.tabs.get(tabId);
    if (view) {
      this.destroyView(state, view);
      state.tabs.delete(tabId);
      this.tabToWindow.delete(tabId);
    }
    if (this.secureTabs.has(tabId)) {
      void this.secureTabManager.closeTab(tabId);
      this.secureTabs.delete(tabId);
    }
    state.mru.remove(tabId);
    this.removeFromGlobal(state.profileId, tabId);
    this.readerStateByTab.delete(tabId);
    this.pageFeatsByTab.delete(tabId);
    this.dirtyFormsByTab.delete(tabId);

    // Hook 4: eliminar preview y limpiar throttle al cerrar la tab.
    const { store: previewStore, capturer: previewCapturer } =
      this.ensurePreviewComponents(state.profileId);
    previewStore.delete(tabId).catch(() => {});
    previewCapturer.clearThrottle(tabId);

    if (node) {
      repos.treeNodes.delete(tabId, 'subtree');
    }

    if (state.activeTabId === tabId) {
      state.activeTabId = null;
      const next = this.pickNextTab(state, tabId);
      if (next) {
        await this.activateTab(windowId, next);
      } else {
        this.ctx.events.emit(IPC_EVENTS.ACTIVE_TAB_CHANGED, {
          windowId,
          tabId: null,
        });
        repos.metadata.delete(lastActiveTabKey(state.workspaceId));
      }
    }

    if (node) {
      this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
        workspaceId: node.workspaceId,
      });
      if (node.kind === 'tab' && node.anchored) {
        this.emitAnchoredTabsChanged(state.profileId, repos);
      }
    }
  }

  async reopenLastClosed(windowId: number): Promise<void> {
    const stack = this.recentlyClosed.get(windowId);
    if (!stack || stack.length === 0) return;
    const entry = stack.shift()!;
    const state = this.requireWindow(windowId);
    const targetWsId = this.resolveReopenWorkspace(state, entry.workspaceId);
    await this.createTab(windowId, {
      workspaceId: targetWsId,
      parentId: null,
      url: entry.url,
      activate: true,
      panelId: state.focusedPanelId,
    });
  }

  getRecentlyClosed(windowId: number): RecentlyClosedTab[] {
    return this.recentlyClosed.get(windowId) ?? [];
  }

  async reopenById(windowId: number, closedTabId: string): Promise<string | null> {
    const stack = this.recentlyClosed.get(windowId);
    if (!stack) return null;
    const idx = stack.findIndex((e) => e.tabId === closedTabId);
    if (idx === -1) return null;
    const [entry] = stack.splice(idx, 1);
    const state = this.requireWindow(windowId);
    const targetWsId = this.resolveReopenWorkspace(state, entry!.workspaceId);
    const tab = await this.createTab(windowId, {
      workspaceId: targetWsId,
      parentId: null,
      url: entry!.url,
      activate: true,
      panelId: state.focusedPanelId,
    });
    return tab.id;
  }

  private resolveReopenWorkspace(state: PerWindow, originalWorkspaceId: string): string {
    try {
      const repos = this.reposFor(state);
      const ws = repos.workspaces.getById(originalWorkspaceId);
      if (ws) return originalWorkspaceId;
    } catch { /* ignored */ }
    return state.workspaceId;
  }

  async discardTab(windowId: number, tabId: string): Promise<void> {
    // El perfil de la window que origina la llamada es el dueño de la tab:
    // el renderer no puede ver tabs de otros perfiles. Si el caller pasa una
    // tab que no existe en su perfil, treeNodes.getById devolverá null y
    // mantenemos el comportamiento histórico (NotFoundError).
    const state = this.requireWindow(windowId);
    const repos = this.reposFor(state);

    for (const other of this.windows.values()) {
      if (other.activeTabId === tabId) {
        throw new InvariantViolationError(
          `discardTab: ${tabId} es la tab activa de la window ${other.windowId}; actívate otra antes`,
        );
      }
    }

    const ownerWindowId = this.tabToWindow.get(tabId);
    if (ownerWindowId !== undefined) {
      const owner = this.windows.get(ownerWindowId);
      const view = owner?.tabs.get(tabId);
      if (owner && view) {
        // Hook 3: capturar antes de destruir el WCV (no para tabs blindadas).
        if (!view.webContents.isDestroyed() && !this.secureTabs.has(tabId)) {
          const { capturer } = this.ensurePreviewComponents(owner.profileId);
          await capturer.capture(tabId, view.webContents);
        }
        this.destroyView(owner, view);
        owner.tabs.delete(tabId);
      }
      this.tabToWindow.delete(tabId);
    } else {
      // Tab suspendida (workspace no visible): su WCV vive en
      // suspendedWorkspaces. Sin esto, descartarla solo marcaría la DB y el
      // WCV seguiría en memoria (fuga).
      this.destroySuspendedView(tabId);
    }
    this.dirtyFormsByTab.delete(tabId);

    const node = repos.treeNodes.getById(tabId);
    if (!node) throw new NotFoundError('Node', tabId);
    if (node.kind !== 'tab') {
      throw new InvariantViolationError(`discardTab: ${tabId} no es una tab`);
    }
    repos.treeNodes.update(tabId, { discarded: true });
    this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
      workspaceId: node.workspaceId,
    });
  }

  async restoreTab(windowId: number, tabId: string): Promise<void> {
    const state = this.requireWindow(windowId);
    const repos = this.reposFor(state);
    const node = repos.treeNodes.getById(tabId);
    if (!node) throw new NotFoundError('Node', tabId);
    if (node.kind !== 'tab') {
      throw new InvariantViolationError(`restoreTab: ${tabId} no es una tab`);
    }
    if (node.workspaceId !== state.workspaceId) {
      throw new InvariantViolationError(
        `restoreTab: la tab ${tabId} no pertenece al workspace de la window ${windowId}`,
      );
    }

    if (state.tabs.has(tabId)) return;
    this.spawnView(state, node);
    if (node.discarded) {
      repos.treeNodes.update(tabId, { discarded: false });
      this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
        workspaceId: node.workspaceId,
      });
    }
  }

  // ---------- pin / unpin ----------

  /**
   * Marca la tab como pinned. La tab debe vivir en raíz (parentId === null);
   * si no, lanza InvariantViolationError con código 'CANNOT_PIN_NESTED_TAB'
   * que el renderer traduce a un toast amigable. Tras pinear, la mueve al
   * final del bloque de pinned (positionAtEnd entre pinned tabs) para que
   * la sección visual se mantenga consistente.
   */
  pinTab(windowId: number, tabId: string): TabNode {
    const state = this.requireWindow(windowId);
    const repos = this.reposFor(state);
    const node = repos.treeNodes.getById(tabId);
    if (!node) throw new NotFoundError('Node', tabId);
    if (node.kind !== 'tab') {
      throw new InvariantViolationError(`pinTab: ${tabId} no es una tab`);
    }
    if (node.parentId !== null) {
      throw new InvariantViolationError('CANNOT_PIN_NESTED_TAB');
    }
    if (node.pinned) return node;

    const allInWs = repos.treeNodes.getByWorkspace(node.workspaceId);
    const lastPinnedPos = allInWs
      .filter(
        (n) =>
          n.parentId === null &&
          n.kind === 'tab' &&
          n.pinned &&
          n.id !== tabId,
      )
      .reduce<string | null>(
        (acc, n) => (acc === null || n.position > acc ? n.position : acc),
        null,
      );
    const newPosition = positionsAtEnd(lastPinnedPos);

    repos.treeNodes.reorder(tabId, newPosition);
    // Guardar la URL actual como pinnedUrl para Restaurar/Reemplazar Carga
    const currentUrl = state.tabs.get(tabId)?.webContents.getURL() ?? node.url;
    const updated = repos.treeNodes.setPinned(tabId, true, currentUrl);
    this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
      workspaceId: updated.workspaceId,
    });
    return updated;
  }

  /**
   * Quita el flag pinned y mueve la tab al final del bloque de tabs no
   * pinned con parentId===null para mantener la sección visual coherente.
   */
  unpinTab(windowId: number, tabId: string): TabNode {
    const state = this.requireWindow(windowId);
    const repos = this.reposFor(state);
    const node = repos.treeNodes.getById(tabId);
    if (!node) throw new NotFoundError('Node', tabId);
    if (node.kind !== 'tab') {
      throw new InvariantViolationError(`unpinTab: ${tabId} no es una tab`);
    }
    if (!node.pinned) return node;

    const updatedPinned = repos.treeNodes.setPinned(tabId, false);

    const allInWs = repos.treeNodes.getByWorkspace(updatedPinned.workspaceId);
    const lastUnpinnedPos = allInWs
      .filter(
        (n) =>
          n.parentId === null &&
          !(n.kind === 'tab' && n.pinned) &&
          n.id !== tabId,
      )
      .reduce<string | null>(
        (acc, n) => (acc === null || n.position > acc ? n.position : acc),
        null,
      );
    const newPosition = positionsAtEnd(lastUnpinnedPos);
    repos.treeNodes.reorder(tabId, newPosition);
    const updated = repos.treeNodes.getById(tabId);
    if (!updated || updated.kind !== 'tab') {
      throw new InvariantViolationError(`unpinTab: tab ${tabId} desapareció`);
    }
    this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
      workspaceId: updatedPinned.workspaceId,
    });
    return updated;
  }

  // ---------- Carga: Restaurar / Reemplazar URL anclada ----------

  restorePinnedUrl(windowId: number, tabId: string): void {
    const state = this.requireWindow(windowId);
    const repos = this.reposFor(state);
    const node = repos.treeNodes.getById(tabId);
    if (!node || node.kind !== 'tab' || !node.pinned || !node.pinnedUrl) return;
    const view = state.tabs.get(tabId);
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.loadURL(node.pinnedUrl).catch(() => {});
    }
  }

  replacePinnedUrl(windowId: number, tabId: string): void {
    const state = this.requireWindow(windowId);
    const repos = this.reposFor(state);
    const node = repos.treeNodes.getById(tabId);
    if (!node || node.kind !== 'tab' || !node.pinned) return;
    const view = state.tabs.get(tabId);
    const currentUrl = view?.webContents.getURL() ?? node.url;
    repos.treeNodes.setPinnedUrl(tabId, currentUrl);
    this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, { workspaceId: node.workspaceId });
  }

  // ---------- Ancla: anclar / desanclar / restaurar / reemplazar ----------

  anchorTab(tabId: string): TabNode {
    // Resolver el windowId para este tab
    const windowId = this.tabToWindow.get(tabId);
    const state = windowId !== undefined ? this.windows.get(windowId) : undefined;
    let repos: ProfileRepositories;
    if (state) {
      repos = this.reposFor(state);
    } else {
      // Tab puede estar en otro workspace/perfil no activo; buscar el perfil
      throw new NotFoundError('Tab (window)', tabId);
    }

    const node = repos.treeNodes.getById(tabId);
    if (!node) throw new NotFoundError('Node', tabId);
    if (node.kind !== 'tab') throw new InvariantViolationError(`anchorTab: ${tabId} no es una tab`);
    if (node.anchored) return node;

    // Si el tab está pinned, quitarlo antes de anclar
    if (node.pinned) {
      repos.treeNodes.setPinned(tabId, false);
    }

    const currentUrl = state.tabs.get(tabId)?.webContents.getURL() ?? node.url;
    const updated = repos.treeNodes.setAnchored(tabId, true, currentUrl);

    this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, { workspaceId: updated.workspaceId });
    this.emitAnchoredTabsChanged(state.profileId, repos);
    return updated;
  }

  unanchorTab(tabId: string): TabNode {
    const windowId = this.tabToWindow.get(tabId);
    const state = windowId !== undefined ? this.windows.get(windowId) : undefined;
    let repos: ProfileRepositories;
    if (state) {
      repos = this.reposFor(state);
    } else {
      throw new NotFoundError('Tab (window)', tabId);
    }

    const node = repos.treeNodes.getById(tabId);
    if (!node) throw new NotFoundError('Node', tabId);
    if (node.kind !== 'tab') throw new InvariantViolationError(`unanchorTab: ${tabId} no es una tab`);
    if (!node.anchored) return node;

    const updated = repos.treeNodes.setAnchored(tabId, false);
    this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, { workspaceId: updated.workspaceId });
    this.emitAnchoredTabsChanged(state.profileId, repos);
    return updated;
  }

  restoreAnchoredUrl(tabId: string): void {
    const windowId = this.tabToWindow.get(tabId);
    if (windowId === undefined) return;
    const state = this.windows.get(windowId);
    if (!state) return;
    const repos = this.reposFor(state);
    const node = repos.treeNodes.getById(tabId);
    if (!node || node.kind !== 'tab' || !node.anchored || !node.anchoredUrl) return;
    const view = state.tabs.get(tabId);
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.loadURL(node.anchoredUrl).catch(() => {});
    }
  }

  replaceAnchoredUrl(tabId: string): void {
    const windowId = this.tabToWindow.get(tabId);
    if (windowId === undefined) return;
    const state = this.windows.get(windowId);
    if (!state) return;
    const repos = this.reposFor(state);
    const node = repos.treeNodes.getById(tabId);
    if (!node || node.kind !== 'tab' || !node.anchored) return;
    const view = state.tabs.get(tabId);
    const currentUrl = view?.webContents.getURL() ?? node.url;
    repos.treeNodes.setAnchoredUrl(tabId, currentUrl);
    this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, { workspaceId: node.workspaceId });
    this.emitAnchoredTabsChanged(state.profileId, repos);
  }

  listAnchoredTabs(profileId: string): TabNode[] {
    const repos = this.ctx.profileManager.getRepositories(profileId);
    return repos.treeNodes.listAnchored();
  }

  private emitAnchoredTabsChanged(
    profileId: string,
    repos: ProfileRepositories,
  ): void {
    this.ctx.events.emit(IPC_EVENTS.ANCHORED_TABS_CHANGED, {
      profileId,
      tabs: repos.treeNodes.listAnchored(),
    });
  }

  // ---------- MRU navigation (Ctrl+Tab) ----------

  /**
   * Avanza el cursor temporal de navegación MRU. La primera pulsación
   * toma snapshot de la pila MRU como baseline; las siguientes mueven
   * cursorIndex sin alterar la pila real (eso ocurre en mruCommit).
   */
  mruNavigate(windowId: number, direction: 'prev' | 'next'): void {
    const state = this.windows.get(windowId);
    if (!state) return;

    if (!state.mruNav) {
      const baseline = state.mru.toArray();
      if (baseline.length < 2) return;
      state.mruNav = {
        baseline,
        cursorIndex: direction === 'prev' ? 1 : baseline.length - 1,
      };
    } else {
      const max = state.mruNav.baseline.length - 1;
      const nextIdx =
        direction === 'prev'
          ? Math.min(state.mruNav.cursorIndex + 1, max)
          : Math.max(0, state.mruNav.cursorIndex - 1);
      if (nextIdx === state.mruNav.cursorIndex) return;
      state.mruNav.cursorIndex = nextIdx;
    }

    const tabId = state.mruNav.baseline[state.mruNav.cursorIndex];
    if (!tabId) return;
    this.softActivate(state, tabId);
  }

  /**
   * Confirma la navegación MRU efímera: empuja la tab visible actual al
   * tope de la pila y persiste last-active-tab. Idempotente: llamadas sin
   * navegación activa son no-op.
   */
  mruCommit(windowId: number): void {
    const state = this.windows.get(windowId);
    if (!state || !state.mruNav) return;
    state.mruNav = null;

    const tabId = state.activeTabId;
    if (!tabId) return;

    state.mru.push(tabId);
    const now = Date.now();
    let repos: ProfileRepositories;
    try {
      repos = this.reposFor(state);
    } catch (err) {
      this.ctx.logger.warn(`[mru] commit: perfil cerrado, no se persiste`, err);
      return;
    }
    try {
      repos.treeNodes.update(tabId, { lastActiveAt: now });
    } catch (err) {
      this.ctx.logger.warn(
        `[mru] commit: update lastActiveAt falló (tab=${tabId})`,
        err,
      );
    }
    try {
      repos.metadata.set(lastActiveTabKey(state.workspaceId), tabId);
    } catch (err) {
      this.ctx.logger.warn(`[mru] commit: persistir last-active-tab falló`, err);
    }
  }

  /**
   * Activa visualmente una tab sin tocar pila MRU ni persistencia. Si la
   * tab está descartada, se materializa el WCV (lazy load on demand). Se
   * usa exclusivamente durante la navegación efímera de Ctrl+Tab.
   */
  private softActivate(state: PerWindow, tabId: string): void {
    const repos = this.reposFor(state);
    const node = repos.treeNodes.getById(tabId);
    if (!node || node.kind !== 'tab') return;
    if (node.workspaceId !== state.workspaceId) return;

    if (!state.tabs.has(tabId)) {
      this.spawnView(state, node);
      if (node.discarded) {
        try {
          repos.treeNodes.update(tabId, { discarded: false });
        } catch (err) {
          this.ctx.logger.warn(
            `[mru] softActivate: update discarded falló (tab=${tabId})`,
            err,
          );
        }
      }
    }

    const previousId = state.activeTabId;
    if (previousId && previousId !== tabId) {
      state.tabs.get(previousId)?.setBounds({ x: -20000, y: 0, width: 1, height: 1 });
    }
    state.activeTabId = tabId;
    this.recalculateBounds(state.windowId);
    this.ctx.events.emit(IPC_EVENTS.ACTIVE_TAB_CHANGED, {
      windowId: state.windowId,
      tabId,
    });
    this.notifyActiveTabToExtensions(state, tabId);
  }

  // ---------- auto-grouping ----------

  private applyAutoGroupRules(state: PerWindow, tabId: string): void {
    try {
      const repos = this.reposFor(state);
      const moved = applyRulesToTab(
        tabId,
        {
          rules: repos.autoGroupRules,
          nodes: repos.treeNodes,
        },
        this.ctx.logger,
      );
      if (moved) {
        this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
          workspaceId: moved.workspaceId,
        });
      }
    } catch (err) {
      this.ctx.logger.warn(
        `[auto-group] applyRulesToTab falló (tab=${tabId})`,
        err,
      );
    }
  }

  // ---------- navegación ----------

  goBack(windowId: number): void {
    const wc = this.activeWebContents(windowId);
    if (wc?.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  }

  goForward(windowId: number): void {
    const wc = this.activeWebContents(windowId);
    if (wc?.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  }

  /**
   * Devuelve el historial de navegación (atrás/adelante) de la pestaña activa
   * de la ventana, junto con el índice de la entrada actual. Usado por el popup
   * de historial que se abre al hacer clic derecho en los botones atrás/adelante.
   */
  getNavHistory(windowId: number): {
    entries: { index: number; url: string; title: string }[];
    activeIndex: number;
  } {
    const wc = this.activeWebContents(windowId);
    if (!wc) return { entries: [], activeIndex: -1 };
    const nav = wc.navigationHistory;
    const activeIndex = nav.getActiveIndex();
    const entries = nav.getAllEntries().map((entry, index) => ({
      index,
      url: entry.url,
      title: entry.title && entry.title.length > 0 ? entry.title : entry.url,
    }));
    return { entries, activeIndex };
  }

  /** Navega a una entrada concreta del historial por su índice. */
  goToIndex(windowId: number, index: number): void {
    const wc = this.activeWebContents(windowId);
    if (!wc) return;
    const nav = wc.navigationHistory;
    if (index >= 0 && index < nav.length() && index !== nav.getActiveIndex()) {
      nav.goToIndex(index);
    }
  }

  reload(windowId: number): void {
    const wc = this.activeWebContents(windowId);
    wc?.reload();
  }

  reloadIgnoringCache(windowId: number): void {
    const wc = this.activeWebContents(windowId);
    wc?.reloadIgnoringCache();
  }

  stop(windowId: number): void {
    const wc = this.activeWebContents(windowId);
    wc?.stop();
  }

  goto(windowId: number, url: string): void {
    const wc = this.activeWebContents(windowId);
    if (!wc) return;
    void wc.loadURL(url).catch((err: unknown) => {
      this.ctx.logger.warn(`[tabs] loadURL falló (${url})`, err);
    });
  }

  // ---------- helpers para handlers IPC ----------

  getActiveTabId(windowId: number): string | null {
    return this.windows.get(windowId)?.activeTabId ?? null;
  }

  getWorkspaceForWindow(windowId: number): string | null {
    return this.windows.get(windowId)?.workspaceId ?? null;
  }

  getProfileForWindow(windowId: number): string | null {
    return this.windows.get(windowId)?.profileId ?? null;
  }

  getWcvForTab(tabId: string): WebContentsView | null {
    const windowId = this.tabToWindow.get(tabId);
    if (windowId === undefined) return null;
    return this.windows.get(windowId)?.tabs.get(tabId) ?? null;
  }

  getActiveTabSession(windowId: number) {
    const state = this.windows.get(windowId);
    if (!state?.activeTabId) return null;
    const view = state.tabs.get(state.activeTabId);
    if (!view || view.webContents.isDestroyed()) return null;
    return view.webContents.session;
  }

  /**
   * Devuelve la primera ventana que está en el workspace dado, o null. Útil
   * para "abrir URL en nueva pestaña" cuando el llamador solo conoce el
   * workspace activo.
   */
  findWindowForWorkspace(workspaceId: string): number | null {
    for (const state of this.windows.values()) {
      if (state.workspaceId === workspaceId) return state.windowId;
    }
    return null;
  }

  getRuntimeForTab(tabId: string): TabRuntime | null {
    const windowId = this.tabToWindow.get(tabId);
    if (windowId === undefined) return null;
    const state = this.windows.get(windowId);
    const view = state?.tabs.get(tabId);
    if (!view || !state) return null;
    const wc = view.webContents;
    let panelId: PanelId | null = null;
    for (const [pid, tid] of state.panelTabIds) {
      if (tid === tabId) { panelId = pid; break; }
    }
    return {
      id: tabId,
      webContentsViewId: wc.id,
      loading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      panelId,
    };
  }

  setSidebarWidth(windowId: number, width: number): void {
    const state = this.windows.get(windowId);
    if (!state) return;
    state.sidebarWidth = Math.max(0, Math.floor(width));
    this.recalculateBounds(windowId);
  }

  setAddressBarHeight(windowId: number, height: number): void {
    const state = this.windows.get(windowId);
    if (!state) return;
    state.addressBarHeight = Math.max(0, Math.floor(height));
    this.recalculateBounds(windowId);
  }

  setOverlayActive(windowId: number, active: boolean): void {
    const state = this.windows.get(windowId);
    if (!state) return;
    if (state.overlayActive === active) return;
    state.overlayActive = active;
    this.recalculateBounds(windowId);
    if (active) {
      const win = BrowserWindow.fromId(windowId);
      if (win && !win.isDestroyed()) win.webContents.focus();
    }
  }

  setNotificationPanelWidth(windowId: number, width: number): void {
    const state = this.windows.get(windowId);
    if (!state) return;
    const clamped = Math.max(0, Math.floor(width));
    if (state.notificationPanelWidth === clamped) return;
    state.notificationPanelWidth = clamped;
    this.recalculateBounds(windowId);
  }

  // TODO(deuda): Electron no expone una API síncrona para el certificado del
  // servidor en conexiones HTTPS válidas. La detección requeriría session.webRequest
  // que no es composable por tab. Queda como pendiente para una futura Sub-fase.
  getActiveTabWebContents(windowId: number): WebContents | null {
    return this.activeWebContents(windowId);
  }

  getWindowLayout(windowId: number): { sidebarWidth: number; addressBarHeight: number } | null {
    const state = this.windows.get(windowId);
    if (!state) return null;
    return { sidebarWidth: state.sidebarWidth, addressBarHeight: state.addressBarHeight };
  }

  getWindowLayoutData(windowId: number): WindowLayout {
    const state = this.windows.get(windowId);
    if (!state) {
      return { mode: 'single', panels: [{ panelId: 'left', activeTabId: null }], splitRatio: 0.5, focusedPanelId: 'left' };
    }
    const panels: import('@vela/shared').PanelState[] = [];
    if (state.layoutMode === 'single') {
      panels.push({ panelId: 'left', activeTabId: state.activeTabId });
    } else {
      const panelIds: PanelId[] = state.layoutMode === 'split-h' ? ['left', 'right'] : ['top', 'bottom'];
      for (const pid of panelIds) {
        panels.push({ panelId: pid, activeTabId: state.panelTabIds.get(pid) ?? null });
      }
    }
    return {
      mode: state.layoutMode,
      panels,
      splitRatio: state.splitRatio,
      focusedPanelId: state.focusedPanelId,
    };
  }

  async setSplit(
    windowId: number,
    mode: 'split-h' | 'split-v',
    tabIdForNewPanel?: string,
  ): Promise<WindowLayout> {
    const state = this.requireWindow(windowId);
    const repos = this.reposFor(state);

    const panelIds: [PanelId, PanelId] = mode === 'split-h' ? ['left', 'right'] : ['top', 'bottom'];
    const [firstPanel, secondPanel] = panelIds;

    if (state.layoutMode !== 'single') {
      // Ya hay split: cambiar orientación si es diferente
      if (state.layoutMode === mode) {
        return this.getWindowLayoutData(windowId);
      }
      // Cambiar orientación: remapear paneles
      const currentFirst = state.panelTabIds.get(state.layoutMode === 'split-h' ? 'left' : 'top');
      const currentSecond = state.panelTabIds.get(state.layoutMode === 'split-h' ? 'right' : 'bottom');
      state.panelTabIds.clear();
      if (currentFirst) state.panelTabIds.set(firstPanel, currentFirst);
      if (currentSecond) state.panelTabIds.set(secondPanel, currentSecond);
      state.layoutMode = mode;
      state.focusedPanelId = firstPanel;
      state.activeTabId = currentFirst ?? null;
    } else {
      // Pasar de single a split
      state.layoutMode = mode;
      state.panelTabIds.clear();

      // Primer panel: tab activa actual
      const currentTabId = state.activeTabId;
      if (currentTabId) {
        state.panelTabIds.set(firstPanel, currentTabId);
      }
      state.focusedPanelId = firstPanel;

      // Segundo panel: tab indicada o nueva blank
      let secondTabId = tabIdForNewPanel;
      if (secondTabId) {
        const node = repos.treeNodes.getById(secondTabId);
        if (node && node.kind === 'tab') {
          if (!state.tabs.has(secondTabId)) {
            this.spawnView(state, node);
            if (node.discarded) repos.treeNodes.update(secondTabId, { discarded: false });
          }
        } else {
          secondTabId = undefined;
        }
      }
      if (!secondTabId) {
        const newTab = repos.treeNodes.createTab({
          workspaceId: state.workspaceId,
          parentId: null,
          url: 'vela://newtab',
          originalTitle: '',
          discarded: false,
          lastActiveAt: Date.now(),
        });
        this.spawnView(state, newTab);
        secondTabId = newTab.id;
        this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, { workspaceId: state.workspaceId });
      }
      state.panelTabIds.set(secondPanel, secondTabId);
    }

    this.recalculateBounds(windowId);

    // Persistir en workspace
    const layout = this.getWindowLayoutData(windowId);
    try {
      repos.workspaces.setLayoutConfig(state.workspaceId, layout);
    } catch (err) {
      this.ctx.logger.warn('[layout] setLayoutConfig falló', err);
    }

    this.ctx.events.emit(IPC_EVENTS.LAYOUT_CHANGED, { windowId, layout });
    return layout;
  }

  async closeSplit(windowId: number): Promise<WindowLayout> {
    const state = this.requireWindow(windowId);
    if (state.layoutMode === 'single') {
      return this.getWindowLayoutData(windowId);
    }

    const focusedTabId = state.panelTabIds.get(state.focusedPanelId) ?? state.activeTabId;

    // Ocultar todos los WCV de paneles
    for (const [, tabId] of state.panelTabIds) {
      if (tabId !== focusedTabId) {
        state.tabs.get(tabId)?.setBounds({ ...HIDDEN_BOUNDS });
      }
    }

    state.layoutMode = 'single';
    state.panelTabIds.clear();
    state.focusedPanelId = 'left';
    if (focusedTabId) {
      state.panelTabIds.set('left', focusedTabId);
      state.activeTabId = focusedTabId;
    }

    this.recalculateBounds(windowId);

    const layout = this.getWindowLayoutData(windowId);
    const repos = this.reposFor(state);
    try {
      repos.workspaces.setLayoutConfig(state.workspaceId, null);
    } catch (err) {
      this.ctx.logger.warn('[layout] clear layoutConfig falló', err);
    }

    this.ctx.events.emit(IPC_EVENTS.LAYOUT_CHANGED, { windowId, layout });
    return layout;
  }

  setFocusedPanel(windowId: number, panelId: PanelId): void {
    const state = this.windows.get(windowId);
    if (!state) return;
    if (state.focusedPanelId === panelId) return;
    if (!state.panelTabIds.has(panelId)) return;

    state.focusedPanelId = panelId;
    const tabId = state.panelTabIds.get(panelId) ?? null;
    state.activeTabId = tabId;

    const layout = this.getWindowLayoutData(windowId);
    this.ctx.events.emit(IPC_EVENTS.LAYOUT_CHANGED, { windowId, layout });
    this.ctx.events.emit(IPC_EVENTS.ACTIVE_TAB_CHANGED, { windowId, tabId });
    if (tabId) this.notifyActiveTabToExtensions(state, tabId);
  }

  async openTabInUnfocusedPanel(windowId: number, tabId: string): Promise<void> {
    const state = this.requireWindow(windowId);
    if (state.layoutMode === 'single') {
      await this.activateTab(windowId, tabId);
      return;
    }

    const repos = this.reposFor(state);
    const node = repos.treeNodes.getById(tabId);
    if (!node || node.kind !== 'tab') throw new Error(`openTabInUnfocusedPanel: tab ${tabId} not found`);

    if (node.workspaceId !== state.workspaceId) {
      this.setWorkspaceForWindow(windowId, node.workspaceId);
      this.ctx.events.emit(IPC_EVENTS.ACTIVE_WORKSPACE_CHANGED, {
        windowId,
        workspaceId: node.workspaceId,
      });
    }

    const firstPanel: PanelId = state.layoutMode === 'split-h' ? 'left' : 'top';
    const secondPanel: PanelId = state.layoutMode === 'split-h' ? 'right' : 'bottom';
    const unfocusedPanel: PanelId = state.focusedPanelId === firstPanel ? secondPanel : firstPanel;

    if (!state.tabs.has(tabId)) {
      this.spawnView(state, node);
      if (node.discarded) {
        repos.treeNodes.update(tabId, { discarded: false });
        this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, { workspaceId: node.workspaceId });
      }
    }

    const prevTabId = state.panelTabIds.get(unfocusedPanel);
    if (prevTabId && prevTabId !== tabId) {
      let usedByOther = false;
      for (const [pid, tid] of state.panelTabIds) {
        if (pid !== unfocusedPanel && tid === prevTabId) { usedByOther = true; break; }
      }
      if (!usedByOther) {
        state.tabs.get(prevTabId)?.setBounds({ ...HIDDEN_BOUNDS });
      }
    }

    state.panelTabIds.set(unfocusedPanel, tabId);
    // focusedPanelId stays unchanged (we don't steal focus)
    this.recalculateBounds(windowId);

    const layout = this.getWindowLayoutData(windowId);
    this.ctx.events.emit(IPC_EVENTS.LAYOUT_CHANGED, { windowId, layout });
  }

  setSplitRatio(windowId: number, ratio: number): void {
    const state = this.windows.get(windowId);
    if (!state || state.layoutMode === 'single') return;
    state.splitRatio = Math.max(0.2, Math.min(0.8, ratio));
    this.recalculateBounds(windowId);
    const layout = this.getWindowLayoutData(windowId);
    this.ctx.events.emit(IPC_EVENTS.LAYOUT_CHANGED, { windowId, layout });
  }

  persistSplitRatio(windowId: number): void {
    const state = this.windows.get(windowId);
    if (!state || state.layoutMode === 'single') return;
    const layout = this.getWindowLayoutData(windowId);
    try {
      const repos = this.reposFor(state);
      repos.workspaces.setLayoutConfig(state.workspaceId, layout);
    } catch (err) {
      this.ctx.logger.warn('[layout] persistSplitRatio falló', err);
    }
  }

  restoreLayoutForWorkspace(windowId: number, workspaceId: string): void {
    const state = this.windows.get(windowId);
    if (!state) return;
    const repos = this.reposFor(state);
    const ws = repos.workspaces.getById(workspaceId);
    if (!ws || !ws.layoutConfig || ws.layoutConfig.mode === 'single') {
      // Cerrar split si había uno activo
      if (state.layoutMode !== 'single') {
        void this.closeSplit(windowId);
      }
      return;
    }
    // Restaurar el layout guardado (si las tabs aún existen)
    const saved = ws.layoutConfig;
    const panelIds: PanelId[] = saved.mode === 'split-h' ? ['left', 'right'] : ['top', 'bottom'];
    let canRestore = true;
    for (const p of saved.panels) {
      if (!p.activeTabId) { canRestore = false; break; }
      const node = repos.treeNodes.getById(p.activeTabId);
      if (!node || node.kind !== 'tab') { canRestore = false; break; }
    }
    if (!canRestore || panelIds.length < 2) return;

    state.layoutMode = saved.mode;
    state.splitRatio = saved.splitRatio;
    state.panelTabIds.clear();
    for (const p of saved.panels) {
      if (!p.activeTabId) continue;
      const node = repos.treeNodes.getById(p.activeTabId);
      if (!node || node.kind !== 'tab') continue;
      if (!state.tabs.has(p.activeTabId)) {
        this.spawnView(state, node);
        if (node.discarded) repos.treeNodes.update(p.activeTabId, { discarded: false });
      }
      state.panelTabIds.set(p.panelId, p.activeTabId);
    }
    state.focusedPanelId = saved.focusedPanelId;
    state.activeTabId = state.panelTabIds.get(state.focusedPanelId) ?? state.activeTabId;
    this.recalculateBounds(windowId);
    const layout = this.getWindowLayoutData(windowId);
    this.ctx.events.emit(IPC_EVENTS.LAYOUT_CHANGED, { windowId, layout });
  }

  setWcvBounds(tabId: string, bounds: { x: number; y: number; width: number; height: number }): void {
    const windowId = this.tabToWindow.get(tabId);
    if (windowId === undefined) return;
    const view = this.windows.get(windowId)?.tabs.get(tabId);
    if (view) view.setBounds(bounds);
  }

  getCertificateForWindow(_windowId: number): null {
    return null;
  }

  async captureVisibleForWindow(windowId: number): Promise<Buffer> {
    const wc = this.activeWebContents(windowId);
    if (!wc || wc.isDestroyed()) throw new Error('No hay pestaña activa');
    const image = await wc.capturePage();
    return image.toPNG();
  }

  async captureRegionForWindow(
    windowId: number,
    region: { x: number; y: number; width: number; height: number },
  ): Promise<Buffer> {
    const wc = this.activeWebContents(windowId);
    if (!wc || wc.isDestroyed()) throw new Error('No hay pestaña activa');
    const image = await wc.capturePage(region);
    return image.toPNG();
  }

  async captureFullPageForWindow(windowId: number): Promise<Buffer> {
    const state = this.windows.get(windowId);
    if (!state) throw new Error('No hay pestaña activa');
    const view = state.activeTabId ? state.tabs.get(state.activeTabId) : null;
    const wc = view?.webContents ?? null;
    if (!wc || wc.isDestroyed()) throw new Error('No hay pestaña activa');

    wc.setBackgroundThrottling(false);

    // Cuando el overlay está activo, el WCV está en HIDDEN_BOUNDS (1×1 px) y la
    // página ha recalculado su layout a 1px de ancho. Usamos CDP
    // Emulation.setDeviceMetricsOverride para restaurar el viewport lógico sin
    // mover los bounds físicos del WCV (eso causaría un stall del compositor GPU).
    const [winW = 800, winH = 600] = state.window.getContentSize();
    const viewportW = Math.max(100, winW - state.sidebarWidth);
    const viewportH = Math.max(100, winH - state.addressBarHeight);

    const dbg = wc.debugger;
    let attached = false;
    let viewportOverrideSet = false;
    try {
      dbg.attach('1.3');
      attached = true;
    } catch {
      // ya estaba adjunto
    }

    try {
      await dbg.sendCommand('Emulation.setDeviceMetricsOverride', {
        width: viewportW,
        height: viewportH,
        deviceScaleFactor: 1,
        mobile: false,
      });
      viewportOverrideSet = true;

      const metricsResult = await dbg.sendCommand('Page.getLayoutMetrics') as {
        contentSize: { width: number; height: number };
      };
      const { width, height } = metricsResult.contentSize;
      const result = await dbg.sendCommand('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 85,
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width, height, scale: 1 },
      }) as { data: string };
      return Buffer.from(result.data, 'base64');
    } finally {
      if (viewportOverrideSet) {
        try { await dbg.sendCommand('Emulation.clearDeviceMetricsOverride'); } catch { /* ignorar */ }
      }
      if (attached) {
        try { dbg.detach(); } catch { /* ignorar */ }
      }
      wc.setBackgroundThrottling(true);
    }
  }

  getPageFeaturesForTab(tabId: string): Array<'rss' | 'form' | 'media'> {
    return this.pageFeatsByTab.get(tabId) ?? [];
  }

  /** True si el usuario tiene datos sin enviar en un formulario de la tab. */
  isTabFormDirty(tabId: string): boolean {
    return this.dirtyFormsByTab.has(tabId);
  }

  /**
   * True si la tab tiene un WebContentsView vivo en runtime, ya sea en una
   * ventana activa o suspendido (workspace no visible). Las tabs suspendidas
   * mantienen su WCV en memoria, así que el DiscardManager debe poder
   * descartarlas para liberar recursos.
   */
  hasRuntimeView(tabId: string): boolean {
    if (this.tabToWindow.has(tabId)) return true;
    for (const suspended of this.suspendedWorkspaces.values()) {
      if (suspended.tabs.has(tabId)) return true;
    }
    return false;
  }

  /** Cualquier ventana abierta del perfil dado (para enrutar repos), o null. */
  getAnyWindowIdForProfile(profileId: string): number | null {
    for (const state of this.windows.values()) {
      if (state.profileId === profileId) return state.windowId;
    }
    return null;
  }

  /** IDs de los perfiles que tienen al menos una ventana abierta en este manager. */
  getOpenProfileIds(): string[] {
    const seen = new Set<string>();
    for (const state of this.windows.values()) {
      seen.add(state.profileId);
    }
    return [...seen];
  }

  /**
   * Localiza el WebContentsView de una tab en cualquier sitio: ventana activa
   * o estado suspendido. Las tabs suspendidas siguen pudiendo reproducir audio,
   * por lo que sus comprobaciones de runtime deben verlas.
   */
  private findViewAnywhere(tabId: string): WebContentsView | null {
    const windowId = this.tabToWindow.get(tabId);
    if (windowId !== undefined) {
      const view = this.windows.get(windowId)?.tabs.get(tabId);
      if (view) return view;
    }
    for (const suspended of this.suspendedWorkspaces.values()) {
      const view = suspended.tabs.get(tabId);
      if (view) return view;
    }
    return null;
  }

  /** Devuelve true si la tab tiene audio activo en su WebContentsView. */
  isTabCurrentlyAudible(tabId: string): boolean {
    const view = this.findViewAnywhere(tabId);
    if (!view || view.webContents.isDestroyed()) return false;
    return view.webContents.isCurrentlyAudible();
  }

  // ---------- internos ----------

  private requireWindow(windowId: number): PerWindow {
    const state = this.windows.get(windowId);
    if (!state) {
      throw new InvariantViolationError(
        `TabManager: window ${windowId} no está registrada (¿olvidaste attachWindow?)`,
      );
    }
    return state;
  }

  /**
   * Repositorios del perfil al que pertenece una window registrada. El perfil
   * tiene que estar abierto: si no lo está, ProfileManager.getRepositories
   * lanza ProfileNotOpenError, que se propaga al caller.
   */
  private reposFor(state: PerWindow): ProfileRepositories {
    return this.ctx.profileManager.getRepositories(state.profileId);
  }

  /**
   * Repositorios del perfil que aloja la tab indicada, vía la window que la
   * tiene materializada. Devuelve null si la tab no está mapeada (tab cerrada,
   * fase de teardown, etc.); el caller decide qué hacer con el null.
   */
  private reposForTab(tabId: string): ProfileRepositories | null {
    const windowId = this.tabToWindow.get(tabId);
    if (windowId === undefined) return null;
    const state = this.windows.get(windowId);
    if (!state) return null;
    try {
      return this.reposFor(state);
    } catch {
      return null;
    }
  }

  private injectUserScript(script: UserScript, _tabId: string, wc: WebContents): void {
    if (wc.isDestroyed()) return;
    if (script.type === 'css') {
      wc.insertCSS(script.code).catch((err) => {
        this.ctx.events.emit(IPC_EVENTS.SCRIPT_ERROR, {
          scriptId: script.id,
          url: wc.isDestroyed() ? '' : wc.getURL(),
          error: String(err),
          timestamp: Date.now(),
        });
      });
    } else {
      wc.executeJavaScript(script.code, false).catch((err) => {
        this.ctx.events.emit(IPC_EVENTS.SCRIPT_ERROR, {
          scriptId: script.id,
          url: wc.isDestroyed() ? '' : wc.getURL(),
          error: String(err),
          timestamp: Date.now(),
        });
      });
    }
  }

  private activeWebContents(windowId: number): WebContents | null {
    const state = this.windows.get(windowId);
    if (!state || !state.activeTabId) return null;
    const view = state.tabs.get(state.activeTabId);
    return view?.webContents ?? null;
  }

  setDeviceEmulation(
    windowId: number,
    params: { width: number; height: number; dpr: number; mobile: boolean; backgroundColor: string },
  ): void {
    const state = this.windows.get(windowId);
    if (!state || !state.activeTabId) return;
    const view = state.tabs.get(state.activeTabId);
    if (!view || view.webContents.isDestroyed()) return;
    state.deviceEmulation = params;
    // El viewport emulado, igual que cualquier WCV, debe respaldarse con blanco
    // (no con el fondo de la shell) para que una web sin `background-color`
    // propio no deje ver el logo VELA dentro del dispositivo.
    view.setBackgroundColor('#ffffff');
    // applyActiveBounds calcula el centrado y llama a enableDeviceEmulation
    this.recalculateBounds(windowId);
  }

  clearDeviceEmulation(windowId: number): void {
    const state = this.windows.get(windowId);
    if (!state) return;
    state.deviceEmulation = null;
    if (state.activeTabId) {
      const view = state.tabs.get(state.activeTabId);
      if (view && !view.webContents.isDestroyed()) {
        view.webContents.disableDeviceEmulation();
        view.setBackgroundColor('#ffffff');
      }
    }
  }

  toggleDevTools(windowId: number, tabId?: string): void {
    const state = this.windows.get(windowId);
    if (!state) return;
    const id = tabId ?? state.activeTabId;
    if (!id) return;
    const view = state.tabs.get(id);
    if (!view) return;
    const wc = view.webContents;
    if (wc.isDestroyed()) return;
    if (wc.isDevToolsOpened()) {
      wc.closeDevTools();
    } else {
      wc.once('devtools-opened', () => {
        setTimeout(() => {
          const dtWC = wc.devToolsWebContents;
          if (!dtWC) return;
          const dtWin = BrowserWindow.fromWebContents(dtWC);
          if (dtWin) {
            try { dtWin.setIcon(getAppIconPath()); } catch { /* ignore */ }
          }
        }, 100);
      });
      wc.openDevTools({ mode: 'detach' });
    }
  }

  private spawnSecureView(state: PerWindow, tab: TabNode, secureSession: Session): WebContentsView {
    const isInternal = tab.url.startsWith('vela://');
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        session: secureSession,
        preload: isInternal ? INTERNAL_PRELOAD_PATH : WEB_TAB_PRELOAD_PATH,
      },
    });

    ensureVelaProtocolOnSession(view.webContents.session);
    ensurePreviewProtocolOnSession(view.webContents.session);

    state.window.contentView.addChildView(view);
    view.setBounds({ ...HIDDEN_BOUNDS });
    // Fondo opaco blanco: ver nota en spawnView.
    view.setBackgroundColor('#ffffff');
    state.tabs.set(tab.id, view);
    this.tabToWindow.set(tab.id, state.windowId);

    this.wireListeners(state, tab.id, view);

    void view.webContents.loadURL(tab.url).catch((err: unknown) => {
      const msg = String((err as { message?: string }).message ?? '');
      if (msg.includes('ERR_ABORTED')) return;
      const code = (err as { code?: string }).code;
      if (code === 'ERR_FAILED' && !view.webContents.isDestroyed()) {
        setTimeout(() => {
          if (!view.webContents.isDestroyed()) {
            void view.webContents.loadURL(tab.url).catch((retryErr: unknown) => {
              this.ctx.logger.warn(`[secure] loadURL inicial falló (${tab.url})`, retryErr);
            });
          }
        }, 1500);
      } else {
        this.ctx.logger.warn(`[secure] loadURL inicial falló (${tab.url})`, err);
      }
    });

    return view;
  }

  private spawnView(state: PerWindow, tab: TabNode): WebContentsView {
    // Cada WebContentsView se crea bajo la sesión particionada del perfil de
    // la window. Si no hay profileId (path heredado de Fase 1, mientras el
    // ProfileWindowManager del Prompt 4 no esté operativo), se cae a la
    // default session, que es donde también viven las extensiones.
    // TODO(prompt-4): hacer profileId obligatorio cuando ProfileWindowManager
    // lo inyecte siempre vía attachWindow.
    const partition = state.profileId
      ? `persist:profile-${state.profileId}`
      : undefined;
    const isInternal = tab.url.startsWith('vela://');
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        ...(partition ? { partition } : {}),
        // Las páginas internas (vela://) reciben el preload principal.
        // Las externas reciben el preload mínimo para
        // poder interceptar window.Notification desde ejecuteJavaScript.
        preload: isInternal ? INTERNAL_PRELOAD_PATH : WEB_TAB_PRELOAD_PATH,
      },
    });

    // Registrar los protocolos vela: y vela-preview: en la sesión particionada.
    // protocol.handle() solo cubre la sesión por defecto; cada sesión
    // particionada necesita su propio registro.
    ensureVelaProtocolOnSession(view.webContents.session);
    ensurePreviewProtocolOnSession(view.webContents.session);

    if (!isInternal) {
      view.webContents.setUserAgent(app.userAgentFallback);
    }

    // Fondo opaco blanco por defecto. Sin esto, el WCV es transparente y las
    // webs que no definen su propio `background-color` dejan ver el backdrop de
    // la shell (logo VELA) a través del contenido. Blanco es el fallback
    // estándar del navegador y "cuadra" con la página: cualquier web que pinte
    // su fondo (incluidas las de tema oscuro) lo dibuja encima de este blanco,
    // así que sólo se ve donde la página es realmente transparente.
    view.setBackgroundColor('#ffffff');

    state.window.contentView.addChildView(view);
    view.setBounds({ ...HIDDEN_BOUNDS });
    state.tabs.set(tab.id, view);
    this.tabToWindow.set(tab.id, state.windowId);

    this.wireListeners(state, tab.id, view);

    void view.webContents.loadURL(tab.url).catch((err: unknown) => {
      const msg = String((err as { message?: string }).message ?? '');
      // ERR_ABORTED ocurre cuando otra navegación (p.ej. vela://cert-error) cancela
      // esta antes de que termine; no es un error real.
      if (msg.includes('ERR_ABORTED')) return;
      const code = (err as { code?: string }).code;
      if (code === 'ERR_FAILED' && !view.webContents.isDestroyed()) {
        setTimeout(() => {
          if (!view.webContents.isDestroyed()) {
            void view.webContents.loadURL(tab.url).catch((retryErr: unknown) => {
              this.ctx.logger.warn(`[tabs] loadURL inicial falló (${tab.url})`, retryErr);
            });
          }
        }, 1500);
      } else {
        this.ctx.logger.warn(`[tabs] loadURL inicial falló (${tab.url})`, err);
      }
    });

    if (this.ctx.onTabAttached) {
      try {
        this.ctx.onTabAttached(view, state.window);
      } catch (err) {
        this.ctx.logger.warn('[tabs] onTabAttached lanzó', err);
      }
    }

    return view;
  }

  private wireListeners(
    state: PerWindow,
    tabId: string,
    view: WebContentsView,
  ): void {
    const wc = view.webContents;

    // ── Guard de navegación (seguridad) ──────────────────────────────────────
    // El contenido web no debe poder auto-navegar (top frame o subframe) hacia
    // esquemas internos privilegiados. Si lo permitiéramos, una pestaña web
    // podría cargar una página vela:// y heredar un senderFrame.url de confianza
    // que pasaría guardTrustedFrame. Las cargas internas legítimas las inicia
    // main vía loadURL (que no dispara will-navigate), así que esto solo afecta
    // a navegaciones iniciadas por el renderer.
    // chrome-extension: NO se bloquea: electron-chrome-extensions carga páginas
    // de extensión (popups/options) que pueden navegar legítimamente a ese
    // esquema, y no son frames de confianza para el IPC (guardTrustedFrame solo
    // confía en vela://file://), así que no hay escalada que prevenir.
    const DANGEROUS_NAV_SCHEMES = new Set([
      'vela:',
      'vela-preview:',
      'file:',
      'chrome:',
      'devtools:',
    ]);
    const blockDangerousNavigation = (
      e: { preventDefault(): void },
      targetUrl: string,
    ): void => {
      const current = wc.isDestroyed() ? '' : wc.getURL();
      const currentIsInternal =
        current === '' ||
        current.startsWith('vela://') ||
        current.startsWith('vela-preview://') ||
        current.startsWith('file://') ||
        current.startsWith('about:');
      if (currentIsInternal) return; // páginas internas pueden navegar entre sí
      let scheme = '';
      try {
        scheme = new URL(targetUrl).protocol;
      } catch {
        return;
      }
      if (DANGEROUS_NAV_SCHEMES.has(scheme)) {
        e.preventDefault();
        this.ctx.logger.warn(
          `[tabs] navegación bloqueada a ${targetUrl} desde ${current}`,
        );
      }
    };
    wc.on('will-navigate', (e, targetUrl) => {
      blockDangerousNavigation(e, targetUrl);
    });
    // will-frame-navigate cubre subframes/iframes (Electron entrega un único
    // objeto evento con .url además de preventDefault()).
    wc.on(
      'will-frame-navigate',
      (details: { preventDefault(): void; url: string }) => {
        blockDangerousNavigation(details, details.url);
      },
    );

    // En split mode: cuando el usuario hace clic en un WCV, auto-detectar el panel.
    wc.on('focus', () => {
      if (state.layoutMode === 'single') return;
      for (const [panelId, pid] of state.panelTabIds) {
        if (pid === tabId && state.focusedPanelId !== panelId) {
          this.setFocusedPanel(state.windowId, panelId);
          break;
        }
      }
    });

    // Intercept window.Notification in web content to route to NotificationCenter.
    // IMPORTANT: requestPermission MUST delegate to the real Chromium API so that
    // setPermissionRequestHandler in sessions.ts can hold the callback until the
    wc.setWindowOpenHandler(({ url, features, disposition }) => {
      // Seguridad: nunca abrir esquemas internos/privilegiados vía window.open.
      let urlScheme = '';
      try { urlScheme = new URL(url).protocol; } catch { /* about:blank, etc. */ }
      if (DANGEROUS_NAV_SCHEMES.has(urlScheme)) {
        this.ctx.logger.warn(`[tabs] window.open bloqueado a esquema interno ${url}`);
        return { action: 'deny' };
      }

      // OAuth / login externo: window.open con dimensiones explícitas o
      // disposition 'new-window'. Necesitan window.opener para postMessage
      // de vuelta al padre. Dejamos que Electron cree una BrowserWindow real.
      const hasExplicitSize = /\b(?:width|height)\s*=\s*\d+/i.test(features);
      if (disposition === 'new-window' || hasExplicitSize) {
        // Especificar la partición explícitamente evita el bug de Electron donde
        // los popups de WebContentsView no heredan la sesión del perfil y caen
        // a la sesión por defecto (sin onBeforeSendHeaders ni UA override).
        // webPreferences seguros SIEMPRE, aunque no haya partición (si no, el
        // popup heredaría los defaults del proceso).
        const partition = state.profileId
          ? `persist:profile-${state.profileId}`
          : undefined;
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: true,
              ...(partition ? { partition } : {}),
            },
          },
        };
      }

      // Resto (target="_blank", clic central, etc.) → nueva pestaña en Vela.
      setImmediate(() => {
        if (state.workspaceId) {
          this.createTab(state.windowId, {
            workspaceId: state.workspaceId,
            parentId: null,
            url,
            activate: true,
          }).catch((err) => {
            this.ctx.logger.warn('[tabs] setWindowOpenHandler createTab falló', err);
          });
        }
      });
      return { action: 'deny' };
    });

    // Popups (OAuth, login externo): sin menú para aspecto minimalista.
    // La lógica de UA para Google OAuth la gestiona onBeforeSendHeaders en sessions.ts.
    wc.on('did-create-window', (childWin) => {
      childWin.setMenuBarVisibility(false);
    });

    wc.on('dom-ready', () => {
      // Inyectar scripts con run_at = document-end
      if (!wc.isDestroyed()) {
        const url = wc.getURL();
        if (url && !url.startsWith('vela://') && !url.startsWith('about:') && !url.startsWith('file://')) {
          const repos = this.reposForTab(tabId);
          if (repos) {
            const matching = repos.userScripts.getMatchingUrl(url);
            for (const script of matching) {
              if (script.runAt !== 'document-end') continue;
              this.injectUserScript(script, tabId, wc);
            }
          }
        }
      }
    });

    wc.on('page-title-updated', (_event, title) => {
      const repos = this.reposForTab(tabId);
      if (!repos) return;
      const node = repos.treeNodes.getById(tabId);
      if (!node || node.kind !== 'tab') return;
      // Solo actualizamos original_title si el usuario no lo ha renombrado;
      // custom_title vive en `name` (null hasta que el usuario lo cambie).
      if (node.name !== null) {
        // El renderer puede querer enterarse del cambio de página igualmente.
        return;
      }
      try {
        repos.treeNodes.update(tabId, { originalTitle: title });
        this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
          workspaceId: node.workspaceId,
        });
      } catch (err) {
        this.ctx.logger.warn(
          `[tabs] update originalTitle falló (tab=${tabId})`,
          err,
        );
      }
    });

    wc.on('page-favicon-updated', (_event, favicons) => {
      const httpsFav = favicons.find((u) => u.startsWith('https://'));
      const chosen = httpsFav ?? favicons[0];
      if (!chosen) return;
      try {
        const repos = this.reposForTab(tabId);
        if (!repos) return;
        const node = repos.treeNodes.getById(tabId);
        if (!node || node.kind !== 'tab') return;
        repos.treeNodes.update(tabId, { favicon: chosen });
        repos.history.updateFaviconForUrl(node.url, chosen);
        this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
          workspaceId: node.workspaceId,
        });
      } catch (err) {
        this.ctx.logger.warn(`[tabs] update favicon falló (tab=${tabId})`, err);
      }
    });

    const emitNavigated = (url: string): void => {
      if (wc.isDestroyed()) return;
      this.ctx.events.emit(IPC_EVENTS.TAB_NAVIGATED, {
        tabId,
        url,
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      });
    };

    const onNavigated = (url: string, isMainNavigation: boolean): void => {
      try {
        const repos = this.reposForTab(tabId);
        if (!repos) return;
        const node = repos.treeNodes.getById(tabId);
        if (!node || node.kind !== 'tab') return;
        if (node.url !== url) {
          repos.treeNodes.update(tabId, { url });
          this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
            workspaceId: node.workspaceId,
          });
          if (node.anchored) {
            this.emitAnchoredTabsChanged(state.profileId, repos);
          }
          // Solo evaluamos reglas en navegaciones de página completa, no en
          // SPA route changes — las reglas son para "primera URL relevante"
          // y aplicarlas en cada cambio de hash sería ruido.
          if (isMainNavigation) {
            this.applyAutoGroupRules(state, tabId);
          }
        }
        // Registrar en historial si no es una página interna, no es tab blindada
        // y el historial está habilitado.
        if (
          isMainNavigation &&
          !url.startsWith('vela://') &&
          !url.startsWith('about:') &&
          !this.secureTabs.has(tabId)
        ) {
          let historyEnabled = true;
          try {
            const raw = repos.settings.get('history:enabled');
            if (raw !== null) historyEnabled = JSON.parse(raw) !== false;
          } catch { /* default true */ }

          if (historyEnabled) {
            repos.history.insert({
              id: crypto.randomUUID(),
              url,
              title: node.originalTitle ?? '',
              favicon: node.favicon ?? null,
              visitedAt: Date.now(),
              workspaceId: node.workspaceId,
              sessionId: this.sessionId,
            });
          }
        }
        emitNavigated(url);
      } catch (err) {
        this.ctx.logger.warn(`[tabs] update url falló (tab=${tabId})`, err);
      }
    };
    wc.on('did-navigate', (_event, url) => onNavigated(url, true));
    wc.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) onNavigated(url, false);
    });

    // El preload reporta si el usuario ha escrito datos sin enviar en un
    // formulario. Lo usamos como excepción de auto-descartado.
    wc.ipc.on('form-dirty:changed', (_event, data: unknown) => {
      const dirty =
        typeof data === 'object' && data !== null && (data as { dirty?: unknown }).dirty === true;
      if (dirty) this.dirtyFormsByTab.add(tabId);
      else this.dirtyFormsByTab.delete(tabId);
    });

    wc.on('did-start-loading', () => {
      // Una navegación/recarga descarta los datos del formulario anterior.
      this.dirtyFormsByTab.delete(tabId);
      this.ctx.events.emit(IPC_EVENTS.TAB_LOADING_CHANGED, {
        tabId,
        loading: true,
      });
      // Inyectar scripts con run_at = document-start (antes del DOM)
      if (!wc.isDestroyed()) {
        const url = wc.getURL();
        if (url && !url.startsWith('vela://') && !url.startsWith('about:') && !url.startsWith('file://')) {
          const repos = this.reposForTab(tabId);
          if (repos) {
            const matching = repos.userScripts.getMatchingUrl(url);
            for (const script of matching) {
              if (script.runAt !== 'document-start') continue;
              this.injectUserScript(script, tabId, wc);
            }
          }
        }
      }
    });

    wc.on('did-stop-loading', () => {
      this.ctx.events.emit(IPC_EVENTS.TAB_LOADING_CHANGED, {
        tabId,
        loading: false,
      });
      // Tras terminar de cargar el historial de navegación puede haber
      // cambiado (redirects que no disparan did-navigate); reemitimos para
      // que la barra refresque canGoBack/canGoForward.
      if (!wc.isDestroyed()) {
        emitNavigated(wc.getURL());
      }
    });

    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      if (errorCode === ERR_ABORTED) return;
      // Los errores de certificado (-200..-219) se gestionan en CertificateManager,
      // que navega la pestaña a vela://cert-error. Suprimimos el log aquí.
      if (errorCode >= -219 && errorCode <= -200) return;
      this.ctx.logger.warn(
        `[tabs] did-fail-load tab=${tabId} url=${validatedURL} code=${errorCode} ${errorDescription}`,
      );
    });

    wc.on('did-finish-load', () => {
      const repos = this.reposForTab(tabId);
      if (!repos) return;
      const node = repos.treeNodes.getById(tabId);
      if (!node) return;
      this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
        workspaceId: node.workspaceId,
      });
      const finishedUrl = wc.isDestroyed() ? '' : wc.getURL();
      emitNavigated(finishedUrl);
      void this.analyzeReadability(state, tabId, wc);
      void this.analyzePageFeatures(state, tabId, wc);

      // Fallback de favicon: algunas páginas no emiten page-favicon-updated
      // (sin <link rel="icon"> o cuando el WCV venía de vela://). Tras un
      // pequeño delay para que page-favicon-updated tenga prioridad, si el
      // favicon sigue siendo null intentamos /favicon.ico especulativamente.
      // El renderer carga la URL y, si devuelve 404, muestra la letra de fallback.
      setTimeout(() => {
        if (wc.isDestroyed()) return;
        const r = this.reposForTab(tabId);
        if (!r) return;
        const n = r.treeNodes.getById(tabId);
        if (!n || n.kind !== 'tab' || n.favicon !== null) return;
        if (n.url.startsWith('vela://') || n.url.startsWith('about:')) return;
        try {
          const { origin } = new URL(n.url);
          if (!origin || origin === 'null') return;
          r.treeNodes.update(tabId, { favicon: `${origin}/favicon.ico` });
          this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, { workspaceId: n.workspaceId });
        } catch { /* URL inválida, ignorar */ }
      }, 500);
      // Inyectar scripts con run_at = document-idle
      if (!wc.isDestroyed() && finishedUrl && !finishedUrl.startsWith('vela://') && !finishedUrl.startsWith('about:') && !finishedUrl.startsWith('file://')) {
        const matching = repos.userScripts.getMatchingUrl(finishedUrl);
        for (const script of matching) {
          if (script.runAt !== 'document-idle') continue;
          this.injectUserScript(script, tabId, wc);
        }
      }

      // Hook 2: capturar tras 2 s para que el layout se pinte.
      setTimeout(() => {
        if (wc.isDestroyed()) return;
        const { capturer } = this.ensurePreviewComponents(state.profileId);
        capturer.capture(tabId, wc).catch(() => {});
      }, 2000);
    });

    if (this.ctx.onTabViewWired) {
      try {
        this.ctx.onTabViewWired(tabId, view, state.windowId, state.profileId);
      } catch (err) {
        this.ctx.logger.warn('[tabs] onTabViewWired lanzó', err);
      }
    }
  }

  /**
   * Notifica al sistema de extensiones (ECE) qué tab queda activa en la
   * ventana, para que `chrome.tabs.query({active:true})` devuelva la tab
   * correcta. Sin esto, ECE reporta siempre la primera tab materializada de la
   * ventana, lo que rompe el autofill de extensiones (p.ej. Bitwarden) al
   * activar una tab anclada. Llamar desde todas las rutas que cambian la tab
   * activa de cara al usuario (activateInternal, softActivate, focusPanel).
   */
  private notifyActiveTabToExtensions(state: PerWindow, tabId: string): void {
    if (!this.ctx.onTabActivated) return;
    const activeWc = state.tabs.get(tabId)?.webContents;
    if (!activeWc || activeWc.isDestroyed()) return;
    try {
      this.ctx.onTabActivated(activeWc, state.window);
    } catch (err) {
      this.ctx.logger.warn('[tabs] onTabActivated lanzó', err);
    }
  }

  private activateInternal(
    state: PerWindow,
    tabId: string,
    opts: { skipGlobalPush?: boolean; panelId?: PanelId } = {},
  ): void {
    if (!state.tabs.has(tabId)) {
      throw new InvariantViolationError(
        `activateInternal: tab ${tabId} no tiene WCV en la window ${state.windowId}`,
      );
    }

    const targetPanel: PanelId = opts.panelId ?? state.focusedPanelId;

    // En split mode: ocultar la tab previa del mismo panel (no las de otros paneles).
    // En single mode: ocultar la tab previa global.
    if (state.layoutMode === 'single') {
      const previousId = state.activeTabId;
      if (previousId && previousId !== tabId) {
        const prev = state.tabs.get(previousId);
        const prevWc = prev?.webContents;
        if (prevWc && !prevWc.isDestroyed()) {
          prevWc.disableDeviceEmulation();
          prev!.setBackgroundColor('#ffffff');
        }
        state.deviceEmulation = null;
        prev?.setBounds({ ...HIDDEN_BOUNDS });
      }
      state.panelTabIds.set('left', tabId);
      state.focusedPanelId = 'left';
    } else {
      // Ocultar la tab anterior de este panel específico
      const prevTabIdInPanel = state.panelTabIds.get(targetPanel);
      if (prevTabIdInPanel && prevTabIdInPanel !== tabId) {
        // Solo ocultar si no está siendo usada por otro panel
        let usedByOther = false;
        for (const [pid, tid] of state.panelTabIds) {
          if (pid !== targetPanel && tid === prevTabIdInPanel) {
            usedByOther = true;
            break;
          }
        }
        if (!usedByOther) {
          const prev = state.tabs.get(prevTabIdInPanel);
          prev?.setBounds({ ...HIDDEN_BOUNDS });
        }
      }
      state.panelTabIds.set(targetPanel, tabId);
      state.focusedPanelId = targetPanel;
    }

    state.activeTabId = tabId;
    state.mru.push(tabId);
    if (!opts.skipGlobalPush) {
      this.pushGlobal(state.profileId, tabId);
    }
    this.recalculateBounds(state.windowId);

    const now = Date.now();
    let repos: ProfileRepositories | null = null;
    try {
      repos = this.reposFor(state);
    } catch (err) {
      this.ctx.logger.warn(
        `[tabs] activateInternal: perfil cerrado, no se persiste`,
        err,
      );
    }
    if (repos) {
      try {
        repos.treeNodes.update(tabId, { lastActiveAt: now });
      } catch (err) {
        this.ctx.logger.warn(
          `[tabs] update lastActiveAt falló (tab=${tabId})`,
          err,
        );
      }
      try {
        repos.metadata.set(lastActiveTabKey(state.workspaceId), tabId);
      } catch (err) {
        this.ctx.logger.warn(`[tabs] set last-active-tab falló`, err);
      }
    }

    this.ctx.events.emit(IPC_EVENTS.ACTIVE_TAB_CHANGED, {
      windowId: state.windowId,
      tabId,
    });

    this.notifyActiveTabToExtensions(state, tabId);
  }

  private async analyzeReadability(
    state: PerWindow,
    tabId: string,
    wc: WebContents,
  ): Promise<void> {
    const url = wc.isDestroyed() ? '' : wc.getURL();
    if (!url || url.startsWith('vela://') || wc.isDestroyed()) return;
    try {
      // Heuristic approximation of Readability check — runs in tab's renderer
      // context where the DOM is fully available, avoiding JSDOM in main.
      // Threshold: >2000 chars AND ≥3 qualifying blocks (reduces false positives
      // on login pages, dashboards and other non-article pages).
      const result = await wc.executeJavaScript(`
        (function() {
          try {
            var blocks = document.querySelectorAll('p, blockquote, pre, td');
            var total = 0, count = 0;
            for (var i = 0; i < blocks.length; i++) {
              var t = (blocks[i].innerText || blocks[i].textContent || '').trim();
              if (t.length > 80) { total += t.length; count++; }
            }
            return [total, count];
          } catch(e) { return [0, 0]; }
        })()
      `);
      if (wc.isDestroyed()) return;
      const readable =
        Array.isArray(result) &&
        typeof result[0] === 'number' &&
        typeof result[1] === 'number' &&
        result[0] > 2000 &&
        result[1] >= 3;
      this.readerStateByTab.set(tabId, { readable });
      this.ctx.events.emit(IPC_EVENTS.TAB_READER_STATE_CHANGED, {
        tabId,
        readable,
        windowId: state.windowId,
      });
      if (readable) {
        this.checkAlwaysOnDomain(state, tabId, url);
      }
    } catch {
      // Tab may have navigated or been destroyed — ignore
    }
  }

  private async analyzePageFeatures(
    state: PerWindow,
    tabId: string,
    wc: WebContents,
  ): Promise<void> {
    const url = wc.isDestroyed() ? '' : wc.getURL();
    if (!url || url.startsWith('vela://') || wc.isDestroyed()) return;
    try {
      const result = await wc.executeJavaScript(`
        (function() {
          try {
            var feats = [];
            var rssLink = document.querySelector(
              'link[type="application/rss+xml"], link[type="application/atom+xml"]'
            );
            if (rssLink) feats.push('rss');
            var visibleInput = document.querySelector('form input:not([type="hidden"])');
            if (visibleInput) feats.push('form');
            var media = document.querySelector('video:not([muted]), audio');
            if (media) feats.push('media');
            return feats;
          } catch(e) { return []; }
        })()
      `);
      if (wc.isDestroyed()) return;
      const features = Array.isArray(result)
        ? (result as string[]).filter((f): f is 'rss' | 'form' | 'media' =>
            f === 'rss' || f === 'form' || f === 'media',
          )
        : [];
      this.pageFeatsByTab.set(tabId, features);
      this.ctx.events.emit(IPC_EVENTS.TAB_FEATURES_CHANGED, {
        tabId,
        windowId: state.windowId,
        features,
      });
    } catch {
      // Tab may have navigated or been destroyed — ignore
    }
  }

  private checkAlwaysOnDomain(state: PerWindow, tabId: string, url: string): void {
    try {
      const repos = this.reposForTab(tabId);
      if (!repos) return;
      const raw = repos.settings.get('reader:always-on-domains');
      if (!raw) return;
      const domains = JSON.parse(raw) as unknown;
      if (!Array.isArray(domains)) return;
      const hostname = new URL(url).hostname;
      if ((domains as string[]).includes(hostname)) {
        this.goto(state.windowId, `vela://reader?source=${encodeURIComponent(url)}`);
      }
    } catch {
      // Ignore parse errors or destroyed state
    }
  }

  // Separación entre paneles (hueco donde el renderer pinta el resizer).
  private static readonly SPLIT_GAP = 4;
  // Espacio reservado en el borde superior de cada panel para el indicador de foco.
  private static readonly FOCUS_INDICATOR_H = 2;

  recalculateBounds(windowId: number): void {
    const state = this.windows.get(windowId);
    if (!state || state.window.isDestroyed()) return;

    if (state.layoutMode === 'single') {
      this.applySingleBounds(state);
    } else {
      this.applySplitBounds(state);
    }
  }

  private applySingleBounds(state: PerWindow): void {
    if (!state.activeTabId) return;
    const view = state.tabs.get(state.activeTabId);
    if (!view) return;

    if (state.overlayActive) {
      view.setBounds({ ...HIDDEN_BOUNDS });
      return;
    }

    const [width = 0, height = 0] = state.window.getContentSize();
    const sidebar = Math.min(state.sidebarWidth, width);
    const top = Math.min(state.addressBarHeight, height);
    const rightReserved = Math.min(state.notificationPanelWidth, width - sidebar);
    const contentW = Math.max(0, width - sidebar - rightReserved);
    const contentH = Math.max(0, height - top);
    const contentBounds = { x: sidebar, y: top, width: contentW, height: contentH };

    if (state.deviceEmulation) {
      const em = state.deviceEmulation;
      const deviceW = Math.min(em.width, contentW);
      const deviceH = Math.min(em.height, contentH);
      const offsetX = Math.max(0, Math.floor((contentW - em.width) / 2));
      view.setBounds({ x: sidebar + offsetX, y: top, width: deviceW, height: deviceH });
      const wc = view.webContents;
      if (!wc.isDestroyed()) {
        wc.enableDeviceEmulation({
          screenPosition: em.mobile ? 'mobile' : 'desktop',
          screenSize: { width: em.width, height: em.height },
          viewPosition: { x: 0, y: 0 },
          deviceScaleFactor: em.dpr,
          viewSize: { width: deviceW, height: deviceH },
          scale: 1,
        });
      }
    } else {
      view.setBounds(contentBounds);
    }
  }

  private applySplitBounds(state: PerWindow): void {
    const [width = 0, height = 0] = state.window.getContentSize();
    const sidebar = Math.min(state.sidebarWidth, width);
    const top = Math.min(state.addressBarHeight, height);
    const rightReserved = Math.min(state.notificationPanelWidth, width - sidebar);
    const contentW = Math.max(0, width - sidebar - rightReserved);
    const contentH = Math.max(0, height - top);

    const ratio = Math.max(0.2, Math.min(0.8, state.splitRatio));
    const gap = TabManager.SPLIT_GAP;
    const indH = TabManager.FOCUS_INDICATOR_H;

    const panelIds: PanelId[] = state.layoutMode === 'split-h'
      ? ['left', 'right']
      : ['top', 'bottom'];

    // Ocultar tabs que no están en ningún panel
    const activePanelTabIds = new Set(state.panelTabIds.values());
    for (const [tabId, view] of state.tabs) {
      if (!activePanelTabIds.has(tabId)) {
        view.setBounds({ ...HIDDEN_BOUNDS });
      }
    }

    if (state.overlayActive) {
      for (const tabId of activePanelTabIds) {
        state.tabs.get(tabId)?.setBounds({ ...HIDDEN_BOUNDS });
      }
      return;
    }

    for (const panelId of panelIds) {
      const tabId = state.panelTabIds.get(panelId);
      if (!tabId) continue;
      const view = state.tabs.get(tabId);
      if (!view) continue;

      let bounds: { x: number; y: number; width: number; height: number };

      if (state.layoutMode === 'split-h') {
        const leftW = Math.floor(contentW * ratio) - Math.ceil(gap / 2);
        const rightX = sidebar + leftW + gap;
        const rightW = Math.max(1, width - rightX - rightReserved);
        if (panelId === 'left') {
          bounds = { x: sidebar, y: top + indH, width: Math.max(1, leftW), height: Math.max(1, contentH - indH) };
        } else {
          bounds = { x: rightX, y: top + indH, width: rightW, height: Math.max(1, contentH - indH) };
        }
      } else {
        const topH = Math.floor(contentH * ratio) - Math.ceil(gap / 2);
        const bottomY = top + topH + gap;
        const bottomH = Math.max(1, height - bottomY);
        if (panelId === 'top') {
          bounds = { x: sidebar, y: top + indH, width: Math.max(1, contentW), height: Math.max(1, topH - indH) };
        } else {
          bounds = { x: sidebar, y: bottomY, width: Math.max(1, contentW), height: bottomH };
        }
      }

      view.setBounds(bounds);
    }
  }

  private destroyView(state: PerWindow, view: WebContentsView): void {
    try {
      if (!state.window.isDestroyed()) {
        state.window.contentView.removeChildView(view);
      }
    } catch (err) {
      this.ctx.logger.warn('[tabs] removeChildView falló', err);
    }
    const wc = view.webContents;
    try {
      wc?.removeAllListeners();
    } catch {
      // ignorar
    }
    if (wc && !wc.isDestroyed()) {
      try {
        wc.close();
      } catch (err) {
        this.ctx.logger.warn('[tabs] webContents.close falló', err);
      }
    }
  }

  /**
   * Destruye el WCV de una tab suspendida (workspace no visible) y la elimina
   * del estado suspendido. Devuelve true si se encontró y destruyó. La entrada
   * del workspace suspendido se elimina si se queda vacía.
   */
  private destroySuspendedView(tabId: string): boolean {
    for (const [key, suspended] of this.suspendedWorkspaces) {
      const view = suspended.tabs.get(tabId);
      if (!view) continue;

      const wc = view.webContents;
      try {
        wc?.removeAllListeners();
      } catch {
        // ignorar
      }
      if (wc && !wc.isDestroyed()) {
        try {
          wc.close();
        } catch (err) {
          this.ctx.logger.warn('[tabs] webContents.close (suspended) falló', err);
        }
      }

      suspended.tabs.delete(tabId);
      suspended.mru.remove(tabId);
      if (suspended.activeTabId === tabId) {
        suspended.activeTabId = suspended.tabs.keys().next().value ?? null;
      }
      if (suspended.tabs.size === 0) {
        this.suspendedWorkspaces.delete(key);
      }
      return true;
    }
    return false;
  }

  private pickNextTab(state: PerWindow, justClosed: string): string | null {
    let candidate = state.mru.peek();
    while (candidate && candidate === justClosed) {
      state.mru.pop();
      candidate = state.mru.peek();
    }
    if (candidate) return candidate;

    const repos = this.reposFor(state);
    const all = repos.treeNodes.getByWorkspace(state.workspaceId);
    const firstTab = all.find(
      (n) => n.kind === 'tab' && n.id !== justClosed,
    );
    return firstTab?.id ?? null;
  }

  private restoreOnStartup(windowId: number, workspaceId: string): void {
    const state = this.windows.get(windowId);
    if (!state) return;

    const repos = this.reposFor(state);
    const all = repos.treeNodes.getByWorkspace(workspaceId);
    const tabs = all.filter((n): n is TabNode => {
      if (n.kind !== 'tab') return false;
      if (n.isSecure) {
        // Las tabs blindadas no sobreviven reinicios: borrar de DB.
        try { repos.treeNodes.delete(n.id, 'subtree'); } catch { /* ignorar */ }
        return false;
      }
      return true;
    });
    if (tabs.length === 0) return;

    const persisted = repos.metadata.get(lastActiveTabKey(workspaceId));
    const fromPersisted = persisted
      ? tabs.find((t) => t.id === persisted)
      : undefined;
    const target = fromPersisted ?? tabs[0];
    if (!target) return;

    // Marcar las demás como discarded para que la DB refleje que no están
    // cargadas. La que vamos a abrir queda con discarded=false.
    for (const tab of tabs) {
      if (tab.id === target.id) {
        if (tab.discarded) {
          repos.treeNodes.update(tab.id, { discarded: false });
        }
      } else if (!tab.discarded) {
        repos.treeNodes.update(tab.id, { discarded: true });
      }
    }

    this.spawnView(state, target);
    // En el arranque (y al cambiar de workspace) la activación de la última
    // tab persistida no debe alterar la pila global: queremos preservar el
    // orden tal y como se guardó. La per-window se rellena con normalidad
    // porque es volátil y se reconstruye desde cero al abrir la window.
    this.activateInternal(state, target.id, { skipGlobalPush: true });
    this.ctx.events.emit(IPC_EVENTS.TREE_CHANGED, { workspaceId });
  }

  // ---------- pila MRU global ----------

  /** Devuelve la pila global del perfil indicado, most-recent-first. */
  getGlobalMru(profileId: string): readonly string[] {
    const stack = this.globalMruByProfile.get(profileId);
    return stack ? stack.toArray() : [];
  }

  private globalStackFor(profileId: string): MruStack<string> {
    let stack = this.globalMruByProfile.get(profileId);
    if (!stack) {
      stack = new MruStack<string>();
      this.globalMruByProfile.set(profileId, stack);
    }
    return stack;
  }

  /**
   * Lazy-load de la pila MRU del perfil desde profile_metadata. Se invoca al
   * registrar la primera ventana del perfil; las siguientes attachWindow del
   * mismo perfil son no-op gracias al set `mruLoaded`.
   */
  private ensureGlobalMruLoaded(
    profileId: string,
    repos: ProfileRepositories,
  ): void {
    if (this.mruLoaded.has(profileId)) return;
    this.mruLoaded.add(profileId);

    let raw: string | null;
    try {
      raw = repos.metadata.get(GLOBAL_MRU_KEY);
    } catch (err) {
      this.ctx.logger.warn('[mru] read global stack falló', err);
      return;
    }
    if (raw === null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      this.ctx.logger.warn('[mru] global stack: JSON inválido, lo descarto', err);
      return;
    }
    if (!Array.isArray(parsed)) return;

    const stack = this.globalStackFor(profileId);
    // El array está most-recent-first. Para reconstruir la pila empujamos en
    // orden inverso (oldest primero) y filtramos ids que ya no existen en
    // DB (huérfanos por crashes o borrados externos).
    for (let i = parsed.length - 1; i >= 0; i--) {
      const id = parsed[i];
      if (typeof id !== 'string') continue;
      try {
        const node = repos.treeNodes.getById(id);
        if (!node || node.kind !== 'tab') continue;
      } catch {
        continue;
      }
      stack.push(id);
    }
    stack.truncate(GLOBAL_MRU_LIMIT);
  }

  private pushGlobal(profileId: string, tabId: string): void {
    const stack = this.globalStackFor(profileId);
    stack.push(tabId);
    stack.truncate(GLOBAL_MRU_LIMIT);
    this.persistGlobalMruStack(profileId);
  }

  private removeFromGlobal(profileId: string, tabId: string): void {
    const stack = this.globalMruByProfile.get(profileId);
    if (!stack) return;
    if (stack.remove(tabId)) {
      this.persistGlobalMruStack(profileId);
    }
  }

  private persistGlobalMruStack(profileId: string): void {
    let repos: ProfileRepositories;
    try {
      repos = this.ctx.profileManager.getRepositories(profileId);
    } catch (err) {
      // Perfil ya cerrado: la próxima vez que se abra se volverá a cargar
      // desde lo último que se persistió cuando estaba abierto.
      this.ctx.logger.warn(
        `[mru] persist: perfil ${profileId} cerrado, no se persiste`,
        err,
      );
      return;
    }
    const stack = this.globalMruByProfile.get(profileId);
    const arr = stack ? stack.toArray() : [];
    try {
      repos.metadata.set(GLOBAL_MRU_KEY, JSON.stringify(arr));
    } catch (err) {
      this.ctx.logger.warn('[mru] persist global stack falló', err);
    }
  }

  // ---------- previews ----------

  private ensurePreviewComponents(profileId: string): { store: PreviewStore; capturer: PreviewCapturer } {
    let store = this.previewStores.get(profileId);
    if (!store) {
      store = new PreviewStore(profileId);
      this.previewStores.set(profileId, store);
    }
    let capturer = this.previewCapturers.get(profileId);
    if (!capturer) {
      const resolvedStore = store;
      capturer = new PreviewCapturer(resolvedStore, this.ctx.logger, () =>
        this.getPreviewSettings(profileId),
      );
      this.previewCapturers.set(profileId, capturer);
    }
    return { store, capturer };
  }

  private getPreviewSettings(profileId: string): CaptureSettings {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      const rawEnabled = repos.settings.get('previews:enabled');
      const rawResolution = repos.settings.get('previews:resolution');

      let enabled = true;
      if (rawEnabled !== null) {
        try { enabled = JSON.parse(rawEnabled) === true; } catch { /* mantener default */ }
      }

      let resolution = 'medium';
      if (rawResolution !== null) {
        try { resolution = JSON.parse(rawResolution) as string; } catch { /* mantener default */ }
      }

      const dims = PREVIEW_DIMENSIONS[resolution] ?? PREVIEW_DIMENSIONS['medium']!;
      return { enabled, width: dims[0], height: dims[1], quality: 75 };
    } catch {
      return { enabled: false, width: 320, height: 200, quality: 75 };
    }
  }

  async cleanupPreviewOrphans(): Promise<void> {
    const seenProfiles = new Set<string>();
    for (const state of this.windows.values()) {
      seenProfiles.add(state.profileId);
    }
    for (const profileId of seenProfiles) {
      try {
        const repos = this.ctx.profileManager.getRepositories(profileId);
        const activeTabs = repos.treeNodes.getAllTabIds();
        const { store } = this.ensurePreviewComponents(profileId);
        const orphans = await store.listOrphans(activeTabs);
        for (const tabId of orphans) {
          await store.delete(tabId);
        }
        if (orphans.length > 0) {
          this.ctx.logger.info(
            `[preview] limpiados ${orphans.length} huérfanos para profile=${profileId}`,
          );
        }
      } catch (err) {
        this.ctx.logger.warn(
          `[preview] cleanupOrphans falló para profile=${profileId}`,
          err,
        );
      }
    }
  }
}

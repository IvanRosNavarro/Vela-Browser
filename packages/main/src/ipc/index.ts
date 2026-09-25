import { safeStorage, app, nativeTheme, type BrowserWindow, type Session } from 'electron';
import { IPC_EVENTS } from '@vela/shared';
import { WindowStateRepository } from '../storage/repositories/WindowStateRepository';
import { getDb } from '../storage/db';
import {
  AppMetadataRepository,
  ProfileRepository,
} from '../storage/repositories';
import { ProfileManager } from '../profiles/ProfileManager';
import { ProfileKeyring } from '../profiles/ProfileKeyring';
import { ProfileWindowManager } from '../profiles/ProfileWindowManager';
import { UnlockRateLimiter } from '../profiles/UnlockRateLimiter';
import { ProfileExtensionManager } from '../extensions/ProfileExtensionManager';
import { TabManager, type TabManagerCtx } from '../tabs/TabManager';
import { logger } from '../logger';
import { createMainEventBus, type MainEventBus } from './events';
import type { IpcContext } from './context';
import { registerWorkspaceHandlers } from './workspaces';
import { registerNodeHandlers } from './nodes';
import { registerTabHandlers } from './tabs';
import { registerTreeHandlers } from './tree';
import { registerNavigationHandlers } from './navigation';
import { registerWindowHandlers } from './window';
import { registerLayoutHandlers } from './layout';
import { registerRuntimeHandlers } from './runtime';
import { registerSettingsHandlers } from './settings';
import { registerMenuHandlers } from './menu';
import { registerRuleHandlers } from './rules';
import { registerSuggestHandlers } from './suggest';
import { registerProfileHandlers } from './profiles';
import { registerUpdateHandlers } from './update';
import { registerThemeHandlers } from './theme';
import { registerReaderHandlers } from './reader';
import { registerDevtoolsHandlers } from './devtools';
import { registerSecurityHandlers } from './security';
import { registerSearchEnginesHandlers } from './searchEngines';
import { registerExtensionHandlers } from './extensions';
import { registerPreviewHandlers } from './previews';
import { registerScreenshotHandlers } from './screenshot';
import { registerDiscardHandlers } from './discard';
import { registerContextMenuHandlers } from './contextMenu';
import { registerFilePickerHandlers } from './filepicker';
import { registerGlanceHandlers } from './glance';
import { registerTrackpadHandlers } from './trackpad';
import { registerDarkModeHandlers } from './darkmode';
import { registerMediaHandlers } from './media';
import { registerHoverUrlHandlers } from './hoverUrl';
import { registerNotesHandlers } from './notes';
import { registerHistoryHandlers } from './history';
import { registerCookieHandlers } from './cookies';
import { registerFavoritesHandlers } from './favorites';
import { registerBrowserImportHandlers } from './browserImport';
import { registerAdBlockerHandlers } from './adblocker';
import { registerVaultHandlers } from './vault';
import { registerAutofillHandlers } from './autofill';
import { registerScriptsHandlers } from './scripts';
import { registerBugSnapshotHandlers } from './bugSnapshot';
import { registerResourcesHandlers } from './resources';
import { registerAparejoHandlers } from './aparejos';
import { registerUrlBarHandlers } from './urlbar';
import { registerTitleBarHandlers } from './titlebar';
import { registerSyncHandlers } from './sync';
import { registerPopupHandlers } from './popups';
import { registerSidebarFloatHandler } from './sidebarFloat';
import { registerAnalyticsDebuggerHandlers } from './analyticsDebugger';
import { registerDownloadHandlers } from './downloads';
import { registerMultiWindowHandlers } from './multiWindow';
import { registerFindHandlers } from './find';
import { registerCertHandlers } from './cert';
import { registerClientCertHandlers } from './clientCert';
import { registerClipboardHandlers } from './clipboard';
import { registerTranslationHandlers } from './translation';
import { CertificateManager } from '../security/CertificateManager';
import { ClientCertificateManager } from '../security/ClientCertificateManager';
import { LayoutManager } from '../layout/LayoutManager';
import { GlanceManager } from '../glance/GlanceManager';
import { TrackpadGestures } from '../gestures/TrackpadGestures';
import { DarkModeManager } from '../darkmode/DarkModeManager';
import { ZoomManager } from '../zoom/ZoomManager';
import { registerZoomHandlers } from './zoom';
import { MediaSessionManager } from '../media/MediaSessionManager';
import { PipManager } from '../media/PipManager';
import { GlobalSettings } from '../settings';
import { MediaPopupWindow } from '../media/MediaPopupWindow';
import { AdBlockerManager } from '../adblocker/AdBlockerManager';
import { DownloadManager } from '../downloads/DownloadManager';
import { NotificationManager } from '../notifications/NotificationManager';
import { PushSubscriptionManager } from '../notifications/PushSubscriptionManager';
import { PushProxyManager } from '../notifications/PushProxyManager';
import { MediaPermissionManager } from '../media-permissions/MediaPermissionManager';
import { registerNotificationHandlers } from './notifications';
import { registerIntegrationsHandlers } from './integrations';
import { initIntegrations } from '../integrations/service';
import { registerMediaPermissionHandlers } from './mediaPermission';
import { restoreNotificationOverrides } from '../profiles/sessions';
export { registerCommandsHandlers } from './commands';

export type { IpcContext } from './context';
export type { MainEventBus } from './events';

export interface BuildIpcContextOptions {
  onTabAttached?: TabManagerCtx['onTabAttached'];
  /** Hook llamado al cambiar la tab activa de una ventana, para que index.ts
   *  notifique a ECE (`selectTab`) qué tab leen las extensiones. */
  onTabActivated?: TabManagerCtx['onTabActivated'];
  /** Crea la BrowserWindow vacía. Se inyecta para que ProfileWindowManager
   *  no dependa del módulo `window/createMainWindow`. */
  createWindow: (initState?: { sidebarWidth?: number }) => BrowserWindow;
  /** Carga el contenido del renderer (dev URL o file build). */
  loadRenderer: (window: BrowserWindow) => void;
  /** Hook tras abrir una ventana (atajos, etc.). */
  onWindowOpened?: (window: BrowserWindow, profileId: string) => void;
  /** Hook llamado cuando la sesión de un perfil está lista, ANTES de que se
   *  carguen las extensiones del perfil. Permite que index.ts cree la instancia
   *  ECE a tiempo para capturar los eventos extension-loaded de las CRX. */
  onProfileSessionReady?: (profileId: string, session: Session) => void;
}

export function buildIpcContext(opts: BuildIpcContextOptions): IpcContext {
  const db = getDb();
  const repositories = {
    profiles: new ProfileRepository(db),
    appMetadata: new AppMetadataRepository(db),
    windowState: new WindowStateRepository(db),
  };
  const events = createMainEventBus();
  const trackpadGestures = new TrackpadGestures(repositories.appMetadata, logger);
  const keyring = new ProfileKeyring({
    logger,
    safeStorage: {
      isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
      encryptString: (s) => safeStorage.encryptString(s),
      decryptString: (b) => safeStorage.decryptString(b),
    },
  });
  const profileManager = new ProfileManager({
    profileRepo: repositories.profiles,
    logger,
    events,
    keyring,
  });
  const extensionManager = new ProfileExtensionManager({
    profileManager,
    logger,
  });
  // Inyección tardía: extensionManager depende de profileManager y viceversa.
  profileManager.setExtensionManager(extensionManager);
  const darkMode = new DarkModeManager({
    getRepositories: (profileId) => {
      try {
        return profileManager.getRepositories(profileId);
      } catch {
        return null;
      }
    },
    prefersDarkColors: () => nativeTheme.shouldUseDarkColors,
    logger,
  });
  // El tema `system` de Vela sigue al SO: con "Seguir el tema de Vela", un
  // cambio de claro a oscuro del sistema se aplica a las pestañas abiertas.
  nativeTheme.on('updated', () => darkMode.refreshAll());
  // Los managers que dependen de tabManager se conectan vía closure para
  // evitar dependencia circular en la construcción.
  let mediaManagerRef: MediaSessionManager | null = null;
  let zoomManagerRef: ZoomManager | null = null;
  let pipManagerRef: PipManager | null = null;
  let notificationManagerRef: import('../notifications/NotificationManager').NotificationManager | null = null;

  const tabManager = new TabManager({
    profileManager,
    events,
    logger,
    ...(opts.onTabAttached ? { onTabAttached: opts.onTabAttached } : {}),
    ...(opts.onTabActivated ? { onTabActivated: opts.onTabActivated } : {}),
    onTabViewWired: (tabId, view, windowId, profileId) => {
      mediaManagerRef?.attachToTab(tabId, view, windowId, profileId);
      pipManagerRef?.attachToTab(tabId, view.webContents);
      notificationManagerRef?.attachToWebContents(view.webContents, profileId);
      trackpadGestures.attach(view.webContents);
      darkMode.attach(view.webContents, profileId);
      zoomManagerRef?.attach(tabId, view.webContents, profileId);
    },
    onTabViewReleased: (tabId) => {
      mediaManagerRef?.releaseTab(tabId);
    },
    onVisibleTabsChanged: (windowId, visibleTabIds) => {
      pipManagerRef?.onVisibleTabsChanged(windowId, visibleTabIds);
    },
    onSecureSessionReady: async (profileId, repos, secureSession) => {
      try {
        const raw = repos.settings.get('extensions:secure-allowed-ids');
        if (!raw) return;
        const allowedIds = new Set(JSON.parse(raw) as string[]);
        if (allowedIds.size === 0) return;
        const userInstalled = await extensionManager.getInstalledExtensions(profileId);
        for (const ext of userInstalled) {
          if (allowedIds.has(ext.id)) {
            await secureSession.extensions.loadExtension(ext.path, { allowFileAccess: true });
          }
        }
      } catch (err) {
        logger.warn('[secure] error cargando extensiones permitidas', err);
      }
    },
  });
  const zoomManager = new ZoomManager({
    getSettings: (profileId) => {
      try {
        return profileManager.getRepositories(profileId).settings;
      } catch {
        return null; // perfil cerrado
      }
    },
    isSecureTab: (tabId) => tabManager.isSecureTab(tabId),
    emit: (state) => events.emit(IPC_EVENTS.TAB_ZOOM_CHANGED, state),
    logger,
  });
  zoomManagerRef = zoomManager;
  // Al cambiar de pestaña activa, el renderer necesita su zoom para el indicador.
  events.on(IPC_EVENTS.ACTIVE_TAB_CHANGED, ({ tabId }) => {
    if (tabId) zoomManager.notify(tabId);
  });
  const layoutManager = new LayoutManager(tabManager);
  const glanceManager = new GlanceManager(tabManager, repositories.appMetadata, logger);

  const mediaManager = new MediaSessionManager({
    events,
    logger,
    getWcvForTab: (tabId) => tabManager.getWcvForTab(tabId),
    getWindowIdForTab: (tabId) => tabManager.getWindowIdForTab(tabId),
  });
  mediaManagerRef = mediaManager;
  const mediaPopupWindow = new MediaPopupWindow(logger);
  const pipManager = new PipManager({
    logger,
    isAutoPipEnabled: () => {
      try {
        return new GlobalSettings(repositories.appMetadata).get<boolean>('media:auto-pip') !== false;
      } catch {
        return true;
      }
    },
    getViewForTab: (tabId) => tabManager.getLiveViewForTab(tabId),
    isTabPlayingMedia: (tabId) => mediaManager.isTabPlaying(tabId),
  });
  pipManagerRef = pipManager;

  const adBlockerManager = new AdBlockerManager({ logger, tabManager, events });
  const downloadManager = new DownloadManager(events, logger);
  const syncManagers = new Map<string, import('../sync/SyncManager').SyncManager>();

  const pushSubscriptionManager = new PushSubscriptionManager({ profileManager, logger });
  const pushProxyManager = new PushProxyManager({ profileManager, logger });
  const notificationManager = new NotificationManager({
    profileManager,
    events,
    logger,
    pushSubscriptionManager,
  });
  profileManager.setNotificationManager(notificationManager);
  notificationManagerRef = notificationManager;

  const mediaPermissionManager = new MediaPermissionManager({ profileManager, events, logger });
  profileManager.setMediaPermissionManager(mediaPermissionManager);

  // Capturar notificaciones de Service Workers: en Electron, los SW pueden tener
  // su propio WebContents. Adjuntamos el interceptor a todos los WC nuevos cuya
  // sesión corresponda a un perfil abierto.
  app.on('web-contents-created', (_, wc) => {
    // Buscar el profileId comparando el objeto Session del WC con los de los perfiles abiertos
    for (const profileId of profileManager.getOpenProfileIds()) {
      try {
        if (profileManager.getSession(profileId) === wc.session) {
          notificationManager.attachToWebContents(wc, profileId);
          break;
        }
      } catch { /* perfil puede haberse cerrado */ }
    }
  });

  profileManager.setProfileSessionReadyCallback(
    (profileId, _session) => {
      // Crear ECE ANTES de que loadExtensionsForProfile cargue las extensiones
      // del usuario. Así ECE captura los eventos extension-loaded y registra los
      // content scripts correctamente (necesario para autofill de Bitwarden, etc.)
      opts.onProfileSessionReady?.(profileId, _session);

      const repos = profileManager.getRepositories(profileId);
      void adBlockerManager.initialize(
        profileId,
        _session,
        repos.settings,
        repos.adBlockerExceptions,
      );
      downloadManager.attachToSession(_session, profileId);
      void restoreNotificationOverrides(_session, profileId, notificationManager);
    },
  );

  const profileWindowManager = new ProfileWindowManager({
    profileManager,
    profileRepo: repositories.profiles,
    appMetadata: repositories.appMetadata,
    windowStateRepo: repositories.windowState,
    tabManager,
    events,
    logger,
    createWindow: opts.createWindow,
    loadRenderer: opts.loadRenderer,
    ...(opts.onWindowOpened ? { onWindowOpened: opts.onWindowOpened } : {}),
  });
  // Sondeo de pull requests. Se crea aquí porque necesita el perfil, las
  // ventanas y las pestañas ya construidos; empieza a mirar en cuanto haya un
  // perfil abierto con cuenta conectada.
  initIntegrations({
    profileManager,
    profileWindowManager,
    notificationManager,
    tabManager,
    events,
  });
  const unlockRateLimiter = new UnlockRateLimiter();
  const certManager = new CertificateManager({
    isUserTab: (wcId) => tabManager.getTabIdForWebContents(wcId) !== null,
  });
  const clientCertManager = new ClientCertificateManager({
    tabManager,
    profileManager,
    profileWindowManager,
    events,
    logger,
  });
  return {
    repositories,
    events,
    tabManager,
    layoutManager,
    glanceManager,
    trackpadGestures,
    darkMode,
    zoomManager,
    mediaManager,
    mediaPopupWindow,
    pipManager,
    logger,
    profileManager,
    profileWindowManager,
    unlockRateLimiter,
    keyring,
    extensionManager,
    adBlockerManager,
    downloadManager,
    notificationManager,
    pushSubscriptionManager,
    pushProxyManager,
    mediaPermissionManager,
    syncManagers,
    certManager,
    clientCertManager,
  };
}

export function registerAllHandlers(ctx: IpcContext): void {
  registerWorkspaceHandlers(ctx);
  registerNodeHandlers(ctx);
  registerTabHandlers(ctx);
  registerTreeHandlers(ctx);
  registerNavigationHandlers(ctx);
  registerWindowHandlers(ctx);
  registerLayoutHandlers(ctx);
  registerRuntimeHandlers(ctx);
  registerSettingsHandlers(ctx);
  registerMenuHandlers(ctx);
  registerRuleHandlers(ctx);
  registerSuggestHandlers(ctx);
  registerProfileHandlers(ctx);
  registerUpdateHandlers(ctx);
  registerThemeHandlers(ctx);
  registerReaderHandlers(ctx);
  registerDevtoolsHandlers(ctx);
  registerSecurityHandlers(ctx);
  registerSearchEnginesHandlers(ctx);
  registerExtensionHandlers(ctx);
  registerPreviewHandlers(ctx);
  registerScreenshotHandlers(ctx);
  registerDiscardHandlers(ctx);
  registerContextMenuHandlers(ctx);
  registerFilePickerHandlers(ctx);
  registerGlanceHandlers(ctx);
  registerTrackpadHandlers(ctx);
  registerDarkModeHandlers(ctx);
  registerZoomHandlers(ctx);
  registerMediaHandlers(ctx);
  registerHoverUrlHandlers(ctx);
  registerNotesHandlers(ctx);
  registerHistoryHandlers(ctx);
  registerCookieHandlers(ctx);
  registerFavoritesHandlers(ctx);
  registerBrowserImportHandlers(ctx);
  registerAdBlockerHandlers(ctx);
  registerVaultHandlers(ctx);
  registerAutofillHandlers(ctx);
  registerScriptsHandlers(ctx);
  registerBugSnapshotHandlers(ctx);
  registerResourcesHandlers(ctx);
  registerAparejoHandlers(ctx);
  registerUrlBarHandlers(ctx);
  registerTitleBarHandlers(ctx);
  registerSyncHandlers(ctx);
  registerPopupHandlers(ctx);
  registerSidebarFloatHandler(ctx);
  registerDownloadHandlers(ctx);
  registerMultiWindowHandlers(ctx);
  registerAnalyticsDebuggerHandlers(ctx);
  registerFindHandlers(ctx);
  registerNotificationHandlers(ctx);
  registerIntegrationsHandlers(ctx);
  registerMediaPermissionHandlers(ctx);
  registerCertHandlers(ctx);
  registerClientCertHandlers(ctx);
  registerClipboardHandlers();
  registerTranslationHandlers(ctx);
}

export function getEventBus(ctx: IpcContext): MainEventBus {
  return ctx.events;
}

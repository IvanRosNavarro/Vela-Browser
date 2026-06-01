import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type EventListener,
  type MainEventPayloads,
  type IpcResponse,
  type PreloadApi,
  type VelaInitState,
} from '@vela/shared';

function call<T>(channel: string, payload?: unknown): Promise<IpcResponse<T>> {
  return ipcRenderer.invoke(channel, payload) as Promise<IpcResponse<T>>;
}

const KNOWN_EVENTS: ReadonlySet<string> = new Set(Object.values(IPC_EVENTS));

const listenerWrappers = new WeakMap<
  EventListener<keyof MainEventPayloads>,
  (event: IpcRendererEvent, payload: unknown) => void
>();

function ensureKnownEvent(channel: string): void {
  if (!KNOWN_EVENTS.has(channel)) {
    throw new Error(`Unknown IPC event channel: ${channel}`);
  }
}

function parseVelaInit(): VelaInitState {
  const arg = (process.argv as string[]).find((a) => a.startsWith('--vela-init='));
  if (!arg) return { sidebarWidth: 240 };
  try {
    const raw = JSON.parse(arg.slice('--vela-init='.length)) as Record<string, unknown>;
    return { sidebarWidth: typeof raw.sidebarWidth === 'number' ? raw.sidebarWidth : 240 };
  } catch {
    return { sidebarWidth: 240 };
  }
}

const api: PreloadApi = {
  platform: process.platform,
  init: parseVelaInit(),
  context: () => call(IPC_CHANNELS.RUNTIME_GET_CONTEXT),
  workspaces: {
    list: () => call(IPC_CHANNELS.WORKSPACE_LIST),
    listAll: () => call(IPC_CHANNELS.WORKSPACE_LIST_ALL),
    getActive: () => call(IPC_CHANNELS.WORKSPACE_GET_ACTIVE),
    setActive: (input) => call(IPC_CHANNELS.WORKSPACE_SET_ACTIVE, input),
    create: (input) => call(IPC_CHANNELS.WORKSPACE_CREATE, input),
    update: (input) => call(IPC_CHANNELS.WORKSPACE_UPDATE, input),
    delete: (input) => call(IPC_CHANNELS.WORKSPACE_DELETE, input),
    archive: (input) => call(IPC_CHANNELS.WORKSPACE_ARCHIVE, input),
    reorder: (input) => call(IPC_CHANNELS.WORKSPACE_REORDER, input),
  },
  profile: {
    list: () => call(IPC_CHANNELS.PROFILE_LIST),
    listArchived: () => call(IPC_CHANNELS.PROFILE_LIST_ARCHIVED),
    getActive: () => call(IPC_CHANNELS.PROFILE_GET_ACTIVE),
    create: (input) => call(IPC_CHANNELS.PROFILE_CREATE, input),
    update: (input) => call(IPC_CHANNELS.PROFILE_UPDATE, input),
    delete: (input) => call(IPC_CHANNELS.PROFILE_DELETE, input),
    archive: (input) => call(IPC_CHANNELS.PROFILE_ARCHIVE, input),
    reorder: (input) => call(IPC_CHANNELS.PROFILE_REORDER, input),
    unlock: (input) => call(IPC_CHANNELS.PROFILE_UNLOCK, input),
    lock: (input) => call(IPC_CHANNELS.PROFILE_LOCK, input),
    setMasterPassword: (input) =>
      call(IPC_CHANNELS.PROFILE_SET_MASTER_PASSWORD, input),
    removeMasterPassword: (input) =>
      call(IPC_CHANNELS.PROFILE_REMOVE_MASTER_PASSWORD, input),
    openWindow: (input) => call(IPC_CHANNELS.PROFILE_OPEN_WINDOW, input),
    clearData: () => call(IPC_CHANNELS.PROFILE_CLEAR_DATA),
  },
  node: {
    createFolder: (input) => call(IPC_CHANNELS.NODE_CREATE_FOLDER, input),
    createFolderTab: (input) => call(IPC_CHANNELS.NODE_CREATE_FOLDER_TAB, input),
    createTab: (input) => call(IPC_CHANNELS.NODE_CREATE_TAB, input),
    update: (input) => call(IPC_CHANNELS.NODE_UPDATE, input),
    delete: (input) => call(IPC_CHANNELS.NODE_DELETE, input),
    move: (input) => call(IPC_CHANNELS.NODE_MOVE, input),
    reorder: (input) => call(IPC_CHANNELS.NODE_REORDER, input),
    toggleCollapse: (input) =>
      call(IPC_CHANNELS.NODE_TOGGLE_COLLAPSE, input),
    rename: (input) => call(IPC_CHANNELS.NODE_RENAME, input),
  },
  tab: {
    activate: (input) => call(IPC_CHANNELS.TAB_ACTIVATE, input),
    close: (input) => call(IPC_CHANNELS.TAB_CLOSE, input),
    discard: (input) => call(IPC_CHANNELS.TAB_DISCARD, input),
    restore: (input) => call(IPC_CHANNELS.TAB_RESTORE, input),
    pin: (input) => call(IPC_CHANNELS.TAB_PIN, input),
    unpin: (input) => call(IPC_CHANNELS.TAB_UNPIN, input),
    restorePinnedUrl: (input) => call(IPC_CHANNELS.TAB_RESTORE_PINNED_URL, input),
    replacePinnedUrl: (input) => call(IPC_CHANNELS.TAB_REPLACE_PINNED_URL, input),
    recentlyClosed: () => call(IPC_CHANNELS.TABS_GET_RECENTLY_CLOSED),
    reopenById: (input) => call(IPC_CHANNELS.TABS_REOPEN_BY_ID, input),
    anchor: (input) => call(IPC_CHANNELS.TAB_ANCHOR, input),
    unanchor: (input) => call(IPC_CHANNELS.TAB_UNANCHOR, input),
    restoreAnchoredUrl: (input) => call(IPC_CHANNELS.TAB_RESTORE_ANCHORED_URL, input),
    replaceAnchoredUrl: (input) => call(IPC_CHANNELS.TAB_REPLACE_ANCHORED_URL, input),
    listAnchored: () => call(IPC_CHANNELS.TAB_LIST_ANCHORED, {}),
    createSecure: (input) => call(IPC_CHANNELS.TAB_CREATE_SECURE, input),
  },
  tree: {
    getByWorkspace: (input) => call(IPC_CHANNELS.TREE_GET_BY_WORKSPACE, input),
    getDescendants: (input) => call(IPC_CHANNELS.TREE_GET_DESCENDANTS, input),
    getAncestors: (input) => call(IPC_CHANNELS.TREE_GET_ANCESTORS, input),
  },
  nav: {
    back: (input) => call(IPC_CHANNELS.NAV_BACK, input),
    forward: (input) => call(IPC_CHANNELS.NAV_FORWARD, input),
    reload: (input) => call(IPC_CHANNELS.NAV_RELOAD, input),
    stop: (input) => call(IPC_CHANNELS.NAV_STOP, input),
    goto: (input) => call(IPC_CHANNELS.NAV_GOTO, input),
    setAddressBarEditing: (input) => call(IPC_CHANNELS.NAV_SET_ADDRESSBAR_EDITING, input),
  },
  window: {
    openUrlInNewTab: (input) =>
      call(IPC_CHANNELS.WINDOW_OPEN_URL_IN_NEW_TAB, input),
    minimize: () => call(IPC_CHANNELS.WINDOW_MINIMIZE),
    toggleMaximize: () => call(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
    close: () => call(IPC_CHANNELS.WINDOW_CLOSE),
    isMaximized: () => call(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
    updateTitleBarOverlay: (opts) => call(IPC_CHANNELS.WINDOW_UPDATE_TITLEBAR_OVERLAY, opts),
    toggleFullscreen: () => call(IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN),
    isFullscreen: () => call(IPC_CHANNELS.WINDOW_IS_FULLSCREEN),
    newSameProfile: () => call(IPC_CHANNELS.WINDOW_NEW_SAME_PROFILE),
    setWorkspace: (input) => call(IPC_CHANNELS.WINDOW_SET_WORKSPACE, input),
    getAllForProfile: () => call(IPC_CHANNELS.WINDOW_GET_ALL_FOR_PROFILE),
    focus: (input) => call(IPC_CHANNELS.WINDOW_FOCUS, input),
    getCurrentId: () => call(IPC_CHANNELS.WINDOW_GET_CURRENT_ID),
  },
  layout: {
    setSidebarWidth: (input) =>
      call(IPC_CHANNELS.LAYOUT_SIDEBAR_WIDTH_CHANGED, input),
    setOverlay: (input) => call(IPC_CHANNELS.LAYOUT_SET_OVERLAY, input),
    setAddressBarHeight: (input) =>
      call(IPC_CHANNELS.LAYOUT_SET_ADDRESS_BAR_HEIGHT, input),
    setNotificationPanelWidth: (input) =>
      call(IPC_CHANNELS.LAYOUT_SET_NOTIFICATION_PANEL_WIDTH, input),
    setSplit: (input) => call(IPC_CHANNELS.LAYOUT_SET_SPLIT, input),
    closeSplit: () => call(IPC_CHANNELS.LAYOUT_CLOSE_SPLIT),
    setRatio: (input) => call(IPC_CHANNELS.LAYOUT_SET_RATIO, input),
    setFocusedPanel: (input) => call(IPC_CHANNELS.LAYOUT_SET_FOCUSED_PANEL, input),
    getLayout: () => call(IPC_CHANNELS.LAYOUT_GET),
    openTabInUnfocusedPanel: (input) => call(IPC_CHANNELS.LAYOUT_OPEN_TAB_IN_UNFOCUSED_PANEL, input),
  },
  runtime: {
    getWindowId: () => call(IPC_CHANNELS.RUNTIME_GET_WINDOW_ID),
    getTabNavState: (input) =>
      call(IPC_CHANNELS.RUNTIME_GET_TAB_NAV_STATE, input),
    getVersions: () => call(IPC_CHANNELS.RUNTIME_GET_VERSIONS),
    getBackgroundMaterial: () => call(IPC_CHANNELS.RUNTIME_GET_BACKGROUND_MATERIAL),
    openExternal: (input) => call(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, input),
  },
  settings: {
    get: (input) => call(IPC_CHANNELS.SETTINGS_GET, input),
    set: (input) => call(IPC_CHANNELS.SETTINGS_SET, input),
    getAll: (input) => call(IPC_CHANNELS.SETTINGS_GET_ALL, input ?? {}),
  },
  menu: {
    show: (input) => call(IPC_CHANNELS.MENU_SHOW, input),
  },
  rule: {
    list: (input) => call(IPC_CHANNELS.RULE_LIST, input),
    create: (input) => call(IPC_CHANNELS.RULE_CREATE, input),
    update: (input) => call(IPC_CHANNELS.RULE_UPDATE, input),
    delete: (input) => call(IPC_CHANNELS.RULE_DELETE, input),
    reorderPriority: (input) =>
      call(IPC_CHANNELS.RULE_REORDER_PRIORITY, input),
  },
  suggest: {
    query: (input) => call(IPC_CHANNELS.SUGGEST_QUERY, input),
  },
  update: {
    checkNow: () => call(IPC_CHANNELS.UPDATE_CHECK_NOW),
    download: () => call(IPC_CHANNELS.UPDATE_DOWNLOAD),
    quitAndInstall: () => call(IPC_CHANNELS.UPDATE_QUIT_AND_INSTALL),
  },
  defaultBrowser: {
    getStatus: () => call(IPC_CHANNELS.DEFAULT_BROWSER_GET_STATUS),
    set: () => call(IPC_CHANNELS.DEFAULT_BROWSER_SET),
  },
  theme: {
    exportFile: (payload) => call(IPC_CHANNELS.THEME_EXPORT_FILE, payload),
  },
  reader: {
    fetchHtml: (input) => call(IPC_CHANNELS.READER_FETCH_HTML, input),
  },
  shortcuts: {
    getAll: () => call(IPC_CHANNELS.SHORTCUTS_GET_ALL),
    set: (input) => call(IPC_CHANNELS.SHORTCUTS_SET, input),
    resetAll: () => call(IPC_CHANNELS.SHORTCUTS_RESET_ALL),
    resetOne: (input) => call(IPC_CHANNELS.SHORTCUTS_RESET_ONE, input),
    export: () => call(IPC_CHANNELS.SHORTCUTS_EXPORT),
    import: () => call(IPC_CHANNELS.SHORTCUTS_IMPORT),
  },
  devtools: {
    setEmulation: (params) => call(IPC_CHANNELS.DEVTOOLS_SET_EMULATION, params),
    clearEmulation: () => call(IPC_CHANNELS.DEVTOOLS_CLEAR_EMULATION),
    openResponsive: () => call(IPC_CHANNELS.DEVTOOLS_OPEN_RESPONSIVE),
    closeResponsive: () => call(IPC_CHANNELS.DEVTOOLS_CLOSE_RESPONSIVE),
  },
  security: {
    getCertificate: (input) => call(IPC_CHANNELS.SECURITY_GET_CERTIFICATE, input),
    openPopup: (input) => call(IPC_CHANNELS.SECURITY_OPEN_POPUP, input),
    closePopup: (input) => call(IPC_CHANNELS.SECURITY_CLOSE_POPUP, input),
  },
  devmode: {
    openPopup: (input) => call(IPC_CHANNELS.DEVMODE_OPEN_POPUP, input),
    closePopup: (input) => call(IPC_CHANNELS.DEVMODE_CLOSE_POPUP, input),
    toggleResponsive: (input) => call(IPC_CHANNELS.DEVMODE_TOGGLE_RESPONSIVE, input),
    toggleEmulation: (input) => call(IPC_CHANNELS.DEVMODE_TOGGLE_EMULATION, input),
  },
  suggestionsPopup: {
    open: (input) => call(IPC_CHANNELS.SUGGESTIONS_POPUP_OPEN, input),
    update: (input) => call(IPC_CHANNELS.SUGGESTIONS_POPUP_UPDATE, input),
    close: (input) => call(IPC_CHANNELS.SUGGESTIONS_POPUP_CLOSE, input),
    select: (input) => call(IPC_CHANNELS.SUGGESTIONS_POPUP_SELECT, input),
  },
  commands: {
    execute: (commandId, opts) => call(IPC_CHANNELS.COMMAND_EXECUTE, { commandId, ...opts }),
  },
  velaMenu: {
    open: (args) => call(IPC_CHANNELS.VELA_MENU_OPEN, args),
    close: (args) => call(IPC_CHANNELS.VELA_MENU_CLOSE, args),
    navigate: (args) => call(IPC_CHANNELS.VELA_MENU_NAVIGATE, args),
  },
  screenshot: {
    captureVisible: () => call(IPC_CHANNELS.SCREENSHOT_CAPTURE_VISIBLE),
    captureRegion: (region) => call(IPC_CHANNELS.SCREENSHOT_CAPTURE_REGION, region),
    captureFullPage: () => call(IPC_CHANNELS.SCREENSHOT_CAPTURE_FULL_PAGE),
    saveFile: (opts) => call(IPC_CHANNELS.SCREENSHOT_SAVE_FILE, opts),
    copyImage: (dataUrl) => call(IPC_CHANNELS.SCREENSHOT_COPY_IMAGE, { dataUrl }),
  },
  mru: {
    confirm: (input) => call(IPC_CHANNELS.MRU_CONFIRM, input),
  },
  searchEngines: {
    getCustomEngines: () => call(IPC_CHANNELS.SEARCH_GET_ENGINES),
    setCustomEngine: (engine) => call(IPC_CHANNELS.SEARCH_SET_ENGINE, engine),
    deleteCustomEngine: (alias) => call(IPC_CHANNELS.SEARCH_DELETE_ENGINE, { alias }),
  },
  extensions: {
    getActions: () => call(IPC_CHANNELS.EXTENSIONS_GET_ACTIONS),
    openPopup: (input) => call(IPC_CHANNELS.EXTENSIONS_OPEN_POPUP, input),
    listInstalled: () => call(IPC_CHANNELS.EXTENSIONS_LIST_INSTALLED),
    enable: (input) => call(IPC_CHANNELS.EXTENSIONS_ENABLE, input),
    disable: (input) => call(IPC_CHANNELS.EXTENSIONS_DISABLE, input),
    uninstall: (input) => call(IPC_CHANNELS.EXTENSIONS_UNINSTALL, input),
    installFromCrx: () => call(IPC_CHANNELS.EXTENSIONS_INSTALL_FROM_CRX),
    installFromPath: (input) => call(IPC_CHANNELS.EXTENSIONS_INSTALL_FROM_PATH, input),
    openOptionsPage: (input) => call(IPC_CHANNELS.EXTENSIONS_OPEN_OPTIONS_PAGE, input),
    setPinned: (input) => call(IPC_CHANNELS.EXTENSIONS_SET_PINNED, input),
    setSecureAllowed: (input) => call(IPC_CHANNELS.EXTENSIONS_SET_SECURE_ALLOWED, input),
  },
  contextMenu: {
    exec: (action) => call(IPC_CHANNELS.CONTEXT_MENU_EXEC, action),
  },
  filepicker: {
    show: (input) => call(IPC_CHANNELS.FILEPICKER_SHOW, input),
    select: (input) => call(IPC_CHANNELS.FILEPICKER_SELECT, input),
    openNative: (input) => call(IPC_CHANNELS.FILEPICKER_OPEN_NATIVE, input),
    listRecent: (input) => call(IPC_CHANNELS.FILEPICKER_LIST_RECENT, input),
    listDownloads: (input) => call(IPC_CHANNELS.FILEPICKER_LIST_DOWNLOADS, input),
    clipboardImage: () => call(IPC_CHANNELS.FILEPICKER_CLIPBOARD_IMAGE),
    cancel: (input) => call(IPC_CHANNELS.FILEPICKER_CANCEL, input),
    clearRecent: (input) => call(IPC_CHANNELS.FILEPICKER_CLEAR_RECENT, input),
  },
  discard: {
    discardTab: (input) => call(IPC_CHANNELS.DISCARD_TAB, input),
    discardFolder: (input) => call(IPC_CHANNELS.DISCARD_FOLDER, input),
    discardWorkspace: (input) => call(IPC_CHANNELS.DISCARD_WORKSPACE, input),
    restoreTab: (input) => call(IPC_CHANNELS.DISCARD_RESTORE_TAB, input),
    restoreWorkspace: (input) => call(IPC_CHANNELS.DISCARD_RESTORE_WORKSPACE, input),
    togglePermanentWhitelist: (input) => call(IPC_CHANNELS.DISCARD_TOGGLE_PERMANENT_WHITELIST, input),
    toggleWorkspaceWhitelist: (input) => call(IPC_CHANNELS.DISCARD_TOGGLE_WORKSPACE_WHITELIST, input),
    toggleFolderWhitelist: (input) => call(IPC_CHANNELS.DISCARD_TOGGLE_FOLDER_WHITELIST, input),
    getWhitelistStatus: (input) => call(IPC_CHANNELS.DISCARD_GET_WHITELIST_STATUS, input),
  },
  glance: {
    close: () => call(IPC_CHANNELS.GLANCE_CLOSE),
    openInTab: (input) => call(IPC_CHANNELS.GLANCE_OPEN_IN_TAB, input),
    openInSplit: (input) => call(IPC_CHANNELS.GLANCE_OPEN_IN_SPLIT, input),
  },
  media: {
    getSources: () => call(IPC_CHANNELS.MEDIA_GET_SOURCES),
    play: (input) => call(IPC_CHANNELS.MEDIA_PLAY, input),
    pause: (input) => call(IPC_CHANNELS.MEDIA_PAUSE, input),
    skipNext: (input) => call(IPC_CHANNELS.MEDIA_SKIP_NEXT, input),
    skipPrev: (input) => call(IPC_CHANNELS.MEDIA_SKIP_PREV, input),
    activateTab: (input) => call(IPC_CHANNELS.MEDIA_ACTIVATE_TAB, input),
    getCurrentTime: (input) => call(IPC_CHANNELS.MEDIA_GET_CURRENT_TIME, input),
    seekBy: (input) => call(IPC_CHANNELS.MEDIA_SEEK_BY, input),
    openPopup: (input) => call(IPC_CHANNELS.MEDIA_OPEN_POPUP, input),
    closePopup: () => call(IPC_CHANNELS.MEDIA_CLOSE_POPUP),
  },
  notes: {
    get: (input) => call(IPC_CHANNELS.NOTES_GET, input),
    save: (input) => call(IPC_CHANNELS.NOTES_SAVE, input),
    delete: (input) => call(IPC_CHANNELS.NOTES_DELETE, input),
  },
  history: {
    search: (input) => call(IPC_CHANNELS.HISTORY_SEARCH, input),
    getRecent: (input) => call(IPC_CHANNELS.HISTORY_GET_RECENT, input),
    getSessions: (input) => call(IPC_CHANNELS.HISTORY_GET_SESSIONS, input),
    getDomainStats: (input) => call(IPC_CHANNELS.HISTORY_GET_DOMAIN_STATS, input),
    delete: (input) => call(IPC_CHANNELS.HISTORY_DELETE, input),
    deleteDomain: (input) => call(IPC_CHANNELS.HISTORY_DELETE_DOMAIN, input),
    deleteAll: (input) => call(IPC_CHANNELS.HISTORY_DELETE_ALL, input),
    getForPeriod: (input) => call(IPC_CHANNELS.HISTORY_GET_FOR_PERIOD, input),
  },
  cookies: {
    getForUrl: (url) => call(IPC_CHANNELS.COOKIES_GET_FOR_URL, { url }),
    set: (data) => call(IPC_CHANNELS.COOKIES_SET, data),
    remove: (url, name) => call(IPC_CHANNELS.COOKIES_REMOVE, { url, name }),
    removeAllForDomain: (domain) => call(IPC_CHANNELS.COOKIES_REMOVE_ALL_FOR_DOMAIN, { domain }),
    clearAll: () => call(IPC_CHANNELS.COOKIES_CLEAR_ALL),
    openPanel: (params) => call(IPC_CHANNELS.COOKIES_OPEN_PANEL, params),
    closePanel: (params) => call(IPC_CHANNELS.COOKIES_CLOSE_PANEL, params),
  },
  favorites: {
    list: () => call(IPC_CHANNELS.FAVORITES_LIST),
    add: (input) => call(IPC_CHANNELS.FAVORITES_ADD, input),
    remove: (input) => call(IPC_CHANNELS.FAVORITES_REMOVE, input),
    reorder: (input) => call(IPC_CHANNELS.FAVORITES_REORDER, input),
    updateTitle: (input) => call(IPC_CHANNELS.FAVORITES_UPDATE_TITLE, input),
    createFolder: (input) => call(IPC_CHANNELS.FAVORITES_CREATE_FOLDER, input),
    move: (input) => call(IPC_CHANNELS.FAVORITES_MOVE, input),
    update: (input) => call(IPC_CHANNELS.FAVORITES_UPDATE, input),
    exportFile: (input) => call(IPC_CHANNELS.FAVORITES_EXPORT_FILE, input),
  },
  adblocker: {
    getStatus: (input) => call(IPC_CHANNELS.ADBLOCKER_GET_STATUS, input),
    toggleSite: (input) => call(IPC_CHANNELS.ADBLOCKER_TOGGLE_SITE, input),
    reloadTab: (input) => call(IPC_CHANNELS.ADBLOCKER_RELOAD_TAB, input),
    listExceptions: () => call(IPC_CHANNELS.ADBLOCKER_LIST_EXCEPTIONS),
    removeException: (input) => call(IPC_CHANNELS.ADBLOCKER_REMOVE_EXCEPTION, input),
    updateLists: () => call(IPC_CHANNELS.ADBLOCKER_UPDATE_LISTS),
    openPanel: (input) => call(IPC_CHANNELS.ADBLOCKER_OPEN_PANEL, input),
    closePanel: (input) => call(IPC_CHANNELS.ADBLOCKER_CLOSE_PANEL, input),
  },
  vault: {
    list: () => call(IPC_CHANNELS.VAULT_LIST),
    search: (input) => call(IPC_CHANNELS.VAULT_SEARCH, input),
    getForDomain: (input) => call(IPC_CHANNELS.VAULT_GET_FOR_DOMAIN, input),
    retrieve: (input) => call(IPC_CHANNELS.VAULT_RETRIEVE, input),
    save: (input) => call(IPC_CHANNELS.VAULT_SAVE, input),
    update: (input) => call(IPC_CHANNELS.VAULT_UPDATE, input),
    delete: (input) => call(IPC_CHANNELS.VAULT_DELETE, input),
    fill: (input) => call(IPC_CHANNELS.VAULT_FILL, input),
    markUsed: (input) => call(IPC_CHANNELS.VAULT_MARK_USED, input),
    openSaveModal: (input) => call(IPC_CHANNELS.VAULT_OPEN_SAVE_MODAL, input),
    closeSaveModal: (input) => call(IPC_CHANNELS.VAULT_CLOSE_SAVE_MODAL, input),
    openAutofillModal: (input) => call(IPC_CHANNELS.VAULT_OPEN_AUTOFILL_MODAL, input),
    closeAutofillModal: (input) => call(IPC_CHANNELS.VAULT_CLOSE_AUTOFILL_MODAL, input),
    isUnlocked: () => call(IPC_CHANNELS.VAULT_IS_UNLOCKED),
    listFolders: () => call(IPC_CHANNELS.VAULT_LIST_FOLDERS),
    exportVault: (input) => call(IPC_CHANNELS.VAULT_EXPORT, input),
    importCsv: () => call(IPC_CHANNELS.VAULT_IMPORT_CSV),
    openPendingSaveModal: (input) => call(IPC_CHANNELS.VAULT_OPEN_PENDING_SAVE_MODAL, input),
    openManager: (input) => call(IPC_CHANNELS.VAULT_OPEN_MANAGER, input),
    openAndFill: (input) => call(IPC_CHANNELS.VAULT_OPEN_AND_FILL, input),
    countForDomain: (input) => call(IPC_CHANNELS.VAULT_COUNT_FOR_DOMAIN, input),
  },
  scripts: {
    list: () => call(IPC_CHANNELS.SCRIPTS_LIST),
    add: (input) => call(IPC_CHANNELS.SCRIPTS_ADD, input),
    update: (input) => call(IPC_CHANNELS.SCRIPTS_UPDATE, input),
    delete: (input) => call(IPC_CHANNELS.SCRIPTS_DELETE, input),
    toggle: (input) => call(IPC_CHANNELS.SCRIPTS_TOGGLE, input),
    test: (input) => call(IPC_CHANNELS.SCRIPTS_TEST, input),
    importUrl: (input) => call(IPC_CHANNELS.SCRIPTS_IMPORT_URL, input),
  },
  bugSnapshot: {
    capture: (input) => call(IPC_CHANNELS.BUG_SNAPSHOT_CAPTURE, input),
    showInFolder: (input) => call(IPC_CHANNELS.BUG_SNAPSHOT_SHOW_IN_FOLDER, input),
    openFile: (input) => call(IPC_CHANNELS.BUG_SNAPSHOT_OPEN_FILE, input),
  },
  resources: {
    getAll: (input) => call(IPC_CHANNELS.RESOURCES_GET_ALL, input),
  },
  aparejos: {
    getAll: () => call(IPC_CHANNELS.APAREJOS_GET_ALL),
    set: (input) => call(IPC_CHANNELS.APAREJOS_SET, input),
  },
  urlBarConfig: {
    getConfig: () => call(IPC_CHANNELS.URLBAR_GET_CONFIG),
    setConfig: (input) => call(IPC_CHANNELS.URLBAR_SET_CONFIG, input),
  },
  titleBarConfig: {
    getConfig: () => call(IPC_CHANNELS.TITLEBAR_GET_CONFIG),
    setConfig: (input) => call(IPC_CHANNELS.TITLEBAR_SET_CONFIG, input),
  },
  sync: {
    requestMagicLink: (input: { email: string }) => call(IPC_CHANNELS.SYNC_REQUEST_MAGIC_LINK, input),
    setup: (input: { token: string; syncPassword: string }) => call(IPC_CHANNELS.SYNC_SETUP, input),
    getStatus: () => call(IPC_CHANNELS.SYNC_GET_STATUS),
    syncNow: () => call(IPC_CHANNELS.SYNC_NOW),
    getDevices: () => call(IPC_CHANNELS.SYNC_GET_DEVICES),
    disconnectDevice: (input: { tokenSuffix: string }) => call(IPC_CHANNELS.SYNC_DISCONNECT_DEVICE, input),
    deactivate: () => call(IPC_CHANNELS.SYNC_DEACTIVATE),
    updateDeviceName: (input: { name: string }) => call(IPC_CHANNELS.SYNC_UPDATE_DEVICE_NAME, input),
  },
  recoveryCard: {
    downloadPdf: (input: { email: string; date: string }) => call(IPC_CHANNELS.RECOVERY_CARD_DOWNLOAD_PDF, input),
  },
  workspaceDrop: {
    open: (input) => call(IPC_CHANNELS.WORKSPACE_DROPDOWN_OPEN, input),
    close: (input) => call(IPC_CHANNELS.WORKSPACE_DROPDOWN_CLOSE, input),
    triggerModal: (input) => call(IPC_CHANNELS.WORKSPACE_DROPDOWN_TRIGGER_MODAL, input),
  },
  profileDrop: {
    open: (input) => call(IPC_CHANNELS.PROFILE_DROPDOWN_OPEN, input),
    close: (input) => call(IPC_CHANNELS.PROFILE_DROPDOWN_CLOSE, input),
    triggerModal: (input) => call(IPC_CHANNELS.PROFILE_DROPDOWN_TRIGGER_MODAL, input),
  },
  addNodeMenu: {
    open: (input) => call(IPC_CHANNELS.ADD_NODE_MENU_OPEN, input),
    action: (input) => call(IPC_CHANNELS.ADD_NODE_MENU_ACTION, input),
  },
  downloads: {
    getAll: () => call(IPC_CHANNELS.DOWNLOADS_GET_ALL),
    pause: (id: string) => call(IPC_CHANNELS.DOWNLOADS_PAUSE, { id }),
    resume: (id: string) => call(IPC_CHANNELS.DOWNLOADS_RESUME, { id }),
    cancel: (id: string) => call(IPC_CHANNELS.DOWNLOADS_CANCEL, { id }),
    remove: (id: string) => call(IPC_CHANNELS.DOWNLOADS_REMOVE, { id }),
    clearCompleted: () => call(IPC_CHANNELS.DOWNLOADS_CLEAR_COMPLETED),
    showInFolder: (savePath: string) => call(IPC_CHANNELS.DOWNLOADS_SHOW_IN_FOLDER, { savePath }),
    openFile: (savePath: string) => call(IPC_CHANNELS.DOWNLOADS_OPEN_FILE, { savePath }),
    openFolder: () => call(IPC_CHANNELS.DOWNLOADS_OPEN_FOLDER),
  },
  downloadPopup: {
    open: (args: { windowId: number; anchorRect: { left: number; bottom: number } }) =>
      ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_POPUP_OPEN, args),
    close: (args: { windowId: number }) =>
      ipcRenderer.invoke(IPC_CHANNELS.DOWNLOAD_POPUP_CLOSE, args),
  },
  tabPreview: {
    show: (input) => ipcRenderer.invoke(IPC_CHANNELS.TAB_PREVIEW_SHOW, input) as Promise<void>,
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.TAB_PREVIEW_UPDATE, input) as Promise<void>,
    hide: (input) => ipcRenderer.invoke(IPC_CHANNELS.TAB_PREVIEW_HIDE, input) as Promise<void>,
  },
  analyticsDebugger: {
    open: () => call(IPC_CHANNELS.ANALYTICS_DEBUGGER_OPEN),
    close: () => call(IPC_CHANNELS.ANALYTICS_DEBUGGER_CLOSE),
    clear: () => call(IPC_CHANNELS.ANALYTICS_DEBUGGER_CLEAR),
    getEvents: () => call(IPC_CHANNELS.ANALYTICS_DEBUGGER_GET_EVENTS),
  },
  find: {
    start: (input: { text: string; matchCase?: boolean; windowId?: number }) => call(IPC_CHANNELS.FIND_START, input),
    next: (input?: { windowId?: number }) => call(IPC_CHANNELS.FIND_NEXT, input ?? {}),
    prev: (input?: { windowId?: number }) => call(IPC_CHANNELS.FIND_PREV, input ?? {}),
    stop: (input?: { windowId?: number }) => call(IPC_CHANNELS.FIND_STOP, input ?? {}),
  },
  findBar: {
    open: (args: { windowId: number }) => call(IPC_CHANNELS.FIND_BAR_OPEN, args),
    close: (args: { windowId: number }) => call(IPC_CHANNELS.FIND_BAR_CLOSE, args),
  },
  cluster: {
    openTools: (input) => call(IPC_CHANNELS.TOOLS_CLUSTER_OPEN, input),
    closeTools: (input) => call(IPC_CHANNELS.TOOLS_CLUSTER_CLOSE, input),
    openStatus: (input) => call(IPC_CHANNELS.STATUS_CLUSTER_OPEN, input),
    closeStatus: (input) => call(IPC_CHANNELS.STATUS_CLUSTER_CLOSE, input),
    relayAction: (input) => call(IPC_CHANNELS.CLUSTER_RELAY_ACTION, input),
  },
  on(channel, handler) {
    ensureKnownEvent(channel);
    const wrapped = (_event: IpcRendererEvent, payload: unknown): void => {
      (handler as EventListener<keyof MainEventPayloads>)(payload as never);
    };
    listenerWrappers.set(handler as EventListener<keyof MainEventPayloads>, wrapped);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.off(channel, wrapped);
      listenerWrappers.delete(handler as EventListener<keyof MainEventPayloads>);
    };
  },
  off(channel, handler) {
    ensureKnownEvent(channel);
    const wrapped = listenerWrappers.get(handler as EventListener<keyof MainEventPayloads>);
    if (!wrapped) return;
    ipcRenderer.off(channel, wrapped);
    listenerWrappers.delete(handler as EventListener<keyof MainEventPayloads>);
  },
  notifications: {
    getAll: () => call(IPC_CHANNELS.NOTIFICATIONS_GET_ALL),
    getUnreadCount: () => call(IPC_CHANNELS.NOTIFICATIONS_GET_UNREAD_COUNT),
    markRead: (input) => call(IPC_CHANNELS.NOTIFICATIONS_MARK_READ, input),
    markAllRead: () => call(IPC_CHANNELS.NOTIFICATIONS_MARK_ALL_READ),
    delete: (input) => call(IPC_CHANNELS.NOTIFICATIONS_DELETE, input),
    clearAll: () => call(IPC_CHANNELS.NOTIFICATIONS_CLEAR_ALL),
    grantPermission: (input) => call(IPC_CHANNELS.NOTIFICATIONS_GRANT_PERMISSION, input),
    denyPermission: (input) => call(IPC_CHANNELS.NOTIFICATIONS_DENY_PERMISSION, input),
    getPermission: (input) => call(IPC_CHANNELS.NOTIFICATIONS_GET_PERMISSION, input),
    getAllPermissions: () => call('notifications:get-all-permissions'),
    revokePermission: (input) => call('notifications:revoke-permission', input),
    getSilenceRules: () => call(IPC_CHANNELS.NOTIFICATIONS_GET_SILENCE_RULES),
    setSilenceRules: (input) => call(IPC_CHANNELS.NOTIFICATIONS_SET_SILENCE_RULES, input),
    openPermissionPopup: (input) => call(IPC_CHANNELS.NOTIFICATION_PERMISSION_OPEN_POPUP, input),
    closePermissionPopup: (input) => call(IPC_CHANNELS.NOTIFICATION_PERMISSION_CLOSE_POPUP, input),
    openCenter: () => call(IPC_CHANNELS.NOTIFICATIONS_OPEN_CENTER),
  },
  push: {
    list: () => call(IPC_CHANNELS.PUSH_LIST_SUBSCRIPTIONS),
    unsubscribe: (input) => call(IPC_CHANNELS.PUSH_UNSUBSCRIBE, input),
    unsubscribeAll: () => call(IPC_CHANNELS.PUSH_UNSUBSCRIBE_ALL),
    getSubscription: (input) => call(IPC_CHANNELS.PUSH_GET_SUBSCRIPTION, input),
  },
  clipboard: {
    writeText: (text: string) => call(IPC_CHANNELS.CLIPBOARD_WRITE_TEXT, { text }),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type VelaApi = PreloadApi;

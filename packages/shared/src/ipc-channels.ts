import type { DownloadItem } from './types/download';
import type { CommandRendererActionPayload } from './types/command';
import type { AparejoStatus } from './types/aparejo';
import type { UrlBarIconConfig } from './types/urlbar';
import type { TitleBarIconConfig } from './types/titlebar';
import type { ScriptError } from './types/userScript';
import type { NotificationPermissionState } from './types/notification';
import type { ContextMenuShowPayload } from './types/contextMenu';
import type { WindowLayout } from './types/layout';
import type { MediaSource } from './types/media';
import type { Favorite } from './types/favorite';
import type { TabNode } from './types/treeNode';
import type { AdBlockerCounts } from './types/adblocker';
import type { SyncStatus } from './types/sync';
import type { ExtendedSuggestion } from './types/suggestion';
import type { WindowInfo } from './types/window';

export const IPC_CHANNELS = {
  WORKSPACE_LIST: 'workspace:list',
  WORKSPACE_LIST_ALL: 'workspace:list-all',
  WORKSPACE_GET_ACTIVE: 'workspace:get-active',
  WORKSPACE_SET_ACTIVE: 'workspace:set-active',
  WORKSPACE_CREATE: 'workspace:create',
  WORKSPACE_UPDATE: 'workspace:update',
  WORKSPACE_DELETE: 'workspace:delete',
  WORKSPACE_ARCHIVE: 'workspace:archive',
  WORKSPACE_REORDER: 'workspace:reorder',

  PROFILE_LIST: 'profile:list',
  PROFILE_LIST_ARCHIVED: 'profile:list-archived',
  PROFILE_GET_ACTIVE: 'profile:get-active',
  PROFILE_CREATE: 'profile:create',
  PROFILE_UPDATE: 'profile:update',
  PROFILE_DELETE: 'profile:delete',
  PROFILE_ARCHIVE: 'profile:archive',
  PROFILE_REORDER: 'profile:reorder',
  PROFILE_UNLOCK: 'profile:unlock',
  PROFILE_LOCK: 'profile:lock',
  PROFILE_SET_MASTER_PASSWORD: 'profile:set-master-password',
  PROFILE_REMOVE_MASTER_PASSWORD: 'profile:remove-master-password',
  PROFILE_OPEN_WINDOW: 'profile:open-window',

  NODE_CREATE_FOLDER: 'node:create-folder',
  NODE_CREATE_FOLDER_TAB: 'node:create-folder-tab',
  NODE_CREATE_TAB: 'node:create-tab',
  NODE_UPDATE: 'node:update',
  NODE_DELETE: 'node:delete',
  NODE_MOVE: 'node:move',
  NODE_REORDER: 'node:reorder',
  NODE_TOGGLE_COLLAPSE: 'node:toggle-collapse',
  NODE_RENAME: 'node:rename',

  TAB_ACTIVATE: 'tab:activate',
  TAB_CLOSE: 'tab:close',
  TAB_DISCARD: 'tab:discard',
  TAB_RESTORE: 'tab:restore',
  TAB_PIN: 'tab:pin',
  TAB_UNPIN: 'tab:unpin',
  TAB_RESTORE_PINNED_URL: 'tab:restore-pinned-url',
  TAB_REPLACE_PINNED_URL: 'tab:replace-pinned-url',

  TREE_GET_BY_WORKSPACE: 'tree:get-by-workspace',
  TREE_GET_DESCENDANTS: 'tree:get-descendants',
  TREE_GET_ANCESTORS: 'tree:get-ancestors',

  NAV_BACK: 'nav:back',
  NAV_FORWARD: 'nav:forward',
  NAV_RELOAD: 'nav:reload',
  NAV_STOP: 'nav:stop',
  NAV_GOTO: 'nav:goto',
  NAV_SET_ADDRESSBAR_EDITING: 'nav:set-addressbar-editing',

  WINDOW_OPEN_URL_IN_NEW_TAB: 'window:open-url-in-new-tab',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  WINDOW_UPDATE_TITLEBAR_OVERLAY: 'window:update-titlebar-overlay',
  WINDOW_TOGGLE_FULLSCREEN: 'window:toggle-fullscreen',
  WINDOW_IS_FULLSCREEN: 'window:is-fullscreen',
  LAYOUT_SIDEBAR_WIDTH_CHANGED: 'layout:sidebar-width-changed',
  LAYOUT_SET_OVERLAY: 'layout:set-overlay',
  LAYOUT_SET_ADDRESS_BAR_HEIGHT: 'layout:set-address-bar-height',
  LAYOUT_SET_NOTIFICATION_PANEL_WIDTH: 'layout:set-notification-panel-width',

  SUGGEST_QUERY: 'suggest:query',

  RUNTIME_GET_WINDOW_ID: 'runtime:get-window-id',
  RUNTIME_GET_CONTEXT: 'runtime:get-context',
  RUNTIME_GET_TAB_NAV_STATE: 'runtime:get-tab-nav-state',

  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:get-all',

  UPDATE_CHECK_NOW: 'update:check-now',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_QUIT_AND_INSTALL: 'update:quit-and-install',
  RUNTIME_GET_VERSIONS: 'runtime:get-versions',
  RUNTIME_GET_BACKGROUND_MATERIAL: 'runtime:get-background-material',
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
  PROFILE_CLEAR_DATA: 'profile:clear-data',

  MENU_SHOW: 'menu:show',

  RULE_LIST: 'rule:list',
  RULE_CREATE: 'rule:create',
  RULE_UPDATE: 'rule:update',
  RULE_DELETE: 'rule:delete',
  RULE_REORDER_PRIORITY: 'rule:reorder-priority',

  THEME_EXPORT_FILE: 'theme:export-file',

  READER_FETCH_HTML: 'reader:fetch-html',

  SHORTCUTS_GET_ALL: 'shortcuts:get-all',
  SHORTCUTS_SET: 'shortcuts:set',
  SHORTCUTS_RESET_ALL: 'shortcuts:reset-all',
  SHORTCUTS_RESET_ONE: 'shortcuts:reset-one',
  SHORTCUTS_EXPORT: 'shortcuts:export',
  SHORTCUTS_IMPORT: 'shortcuts:import',

  DEVTOOLS_SET_EMULATION: 'devtools:set-emulation',
  DEVTOOLS_CLEAR_EMULATION: 'devtools:clear-emulation',

  SECURITY_GET_CERTIFICATE: 'security:get-certificate',

  COMMAND_EXECUTE: 'commands:execute',

  SEARCH_GET_ENGINES: 'search:get-engines',
  SEARCH_SET_ENGINE: 'search:set-engine',
  SEARCH_DELETE_ENGINE: 'search:delete-engine',

  NOTIFICATIONS_GET_ALL: 'notifications:get-all',
  NOTIFICATIONS_MARK_READ: 'notifications:mark-read',
  NOTIFICATIONS_MARK_ALL_READ: 'notifications:mark-all-read',
  NOTIFICATIONS_DELETE: 'notifications:delete',
  NOTIFICATIONS_CLEAR_ALL: 'notifications:clear-all',
  NOTIFICATIONS_GET_UNREAD_COUNT: 'notifications:get-unread-count',
  NOTIFICATIONS_GRANT_PERMISSION: 'notifications:grant-permission',
  NOTIFICATIONS_DENY_PERMISSION: 'notifications:deny-permission',
  NOTIFICATIONS_GET_PERMISSION: 'notifications:get-permission',
  NOTIFICATIONS_GET_SILENCE_RULES: 'notifications:get-silence-rules',
  NOTIFICATIONS_SET_SILENCE_RULES: 'notifications:set-silence-rules',
  NOTIFICATIONS_OPEN_CENTER: 'notifications:open-center',

  EXTENSIONS_GET_ACTIONS: 'extensions:get-actions',
  EXTENSIONS_OPEN_POPUP: 'extensions:open-popup',

  EXTENSIONS_LIST_INSTALLED: 'extensions:list-installed',
  EXTENSIONS_ENABLE: 'extensions:enable',
  EXTENSIONS_DISABLE: 'extensions:disable',
  EXTENSIONS_UNINSTALL: 'extensions:uninstall',
  EXTENSIONS_INSTALL_FROM_CRX: 'extensions:install-from-crx',
  EXTENSIONS_INSTALL_FROM_PATH: 'extensions:install-from-path',
  EXTENSIONS_OPEN_OPTIONS_PAGE: 'extensions:open-options-page',
  EXTENSIONS_SET_PINNED: 'extensions:set-pinned',
  EXTENSIONS_SET_SECURE_ALLOWED: 'extensions:set-secure-allowed',

  PUSH_LIST_SUBSCRIPTIONS: 'push:list-subscriptions',
  PUSH_UNSUBSCRIBE: 'push:unsubscribe',
  PUSH_UNSUBSCRIBE_ALL: 'push:unsubscribe-all',
  PUSH_GET_SUBSCRIPTION: 'push:get-subscription',
  PUSH_GET_PROXY_SUBSCRIPTION: 'push:get-proxy-subscription',

  PREVIEWS_EXISTS: 'previews:exists',
  MRU_CONFIRM: 'mru:confirm',

  SCREENSHOT_CAPTURE_VISIBLE: 'screenshot:capture-visible',
  SCREENSHOT_CAPTURE_REGION: 'screenshot:capture-region',
  SCREENSHOT_CAPTURE_FULL_PAGE: 'screenshot:capture-full-page',
  SCREENSHOT_SAVE_FILE: 'screenshot:save-file',
  SCREENSHOT_COPY_IMAGE: 'screenshot:copy-image',

  DISCARD_TAB: 'discard:discard-tab',
  DISCARD_FOLDER: 'discard:discard-folder',
  DISCARD_WORKSPACE: 'discard:discard-workspace',
  DISCARD_RESTORE_TAB: 'discard:restore-tab',
  DISCARD_RESTORE_WORKSPACE: 'discard:restore-workspace',
  DISCARD_TOGGLE_PERMANENT_WHITELIST: 'discard:toggle-permanent-whitelist',
  DISCARD_TOGGLE_WORKSPACE_WHITELIST: 'discard:toggle-workspace-whitelist',
  DISCARD_TOGGLE_FOLDER_WHITELIST: 'discard:toggle-folder-whitelist',
  DISCARD_GET_WHITELIST_STATUS: 'discard:get-whitelist-status',

  CONTEXT_MENU_EXEC: 'context-menu:exec',

  FILEPICKER_SHOW: 'filepicker:show',
  FILEPICKER_SELECT: 'filepicker:select',
  FILEPICKER_OPEN_NATIVE: 'filepicker:open-native',
  FILEPICKER_LIST_RECENT: 'filepicker:list-recent',
  FILEPICKER_LIST_DOWNLOADS: 'filepicker:list-downloads',
  FILEPICKER_CLIPBOARD_IMAGE: 'filepicker:clipboard-image',
  FILEPICKER_CANCEL: 'filepicker:cancel',
  FILEPICKER_CLEAR_RECENT: 'filepicker:clear-recent',

  LAYOUT_SET_SPLIT: 'layout:set-split',
  LAYOUT_CLOSE_SPLIT: 'layout:close-split',
  LAYOUT_SET_RATIO: 'layout:set-ratio',
  LAYOUT_SET_FOCUSED_PANEL: 'layout:set-focused-panel',
  LAYOUT_GET: 'layout:get',

  GLANCE_CLOSE: 'glance:close',
  GLANCE_OPEN_IN_TAB: 'glance:open-in-tab',
  GLANCE_OPEN_IN_SPLIT: 'glance:open-in-split',

  MEDIA_GET_SOURCES: 'media:get-sources',
  MEDIA_PLAY: 'media:play',
  MEDIA_PAUSE: 'media:pause',
  MEDIA_SKIP_NEXT: 'media:skip-next',
  MEDIA_SKIP_PREV: 'media:skip-prev',
  MEDIA_ACTIVATE_TAB: 'media:activate-tab',
  MEDIA_GET_CURRENT_TIME: 'media:get-current-time',
  MEDIA_SEEK_BY: 'media:seek-by',
  MEDIA_OPEN_POPUP: 'media:open-popup',
  MEDIA_CLOSE_POPUP: 'media:close-popup',

  TAB_REOPEN_CLOSED: 'tab:reopen-closed',
  TABS_GET_RECENTLY_CLOSED: 'tabs:recently-closed',
  TABS_REOPEN_BY_ID: 'tabs:reopen',

  LAYOUT_OPEN_TAB_IN_UNFOCUSED_PANEL: 'layout:open-tab-in-unfocused-panel',

  HOVER_URL_SET: 'hover-url:set',
  HOVER_URL_CLEAR: 'hover-url:clear',

  FIND_START: 'find:start',
  FIND_NEXT: 'find:next',
  FIND_PREV: 'find:prev',
  FIND_STOP: 'find:stop',

  NOTES_GET: 'notes:get',
  NOTES_SAVE: 'notes:save',
  NOTES_DELETE: 'notes:delete',

  HISTORY_SEARCH: 'history:search',
  HISTORY_GET_RECENT: 'history:get-recent',
  HISTORY_GET_SESSIONS: 'history:get-sessions',
  HISTORY_GET_DOMAIN_STATS: 'history:get-domain-stats',
  HISTORY_DELETE: 'history:delete',
  HISTORY_DELETE_DOMAIN: 'history:delete-domain',
  HISTORY_DELETE_ALL: 'history:delete-all',
  HISTORY_GET_FOR_PERIOD: 'history:get-for-period',

  COOKIES_GET_FOR_URL: 'cookies:get-for-url',
  COOKIES_SET: 'cookies:set',
  COOKIES_REMOVE: 'cookies:remove',
  COOKIES_REMOVE_ALL_FOR_DOMAIN: 'cookies:remove-all-for-domain',
  COOKIES_CLEAR_ALL: 'cookies:clear-all',
  COOKIES_OPEN_PANEL: 'cookies:open-panel',
  COOKIES_CLOSE_PANEL: 'cookies:close-panel',

  FAVORITES_LIST: 'favorites:list',
  FAVORITES_ADD: 'favorites:add',
  FAVORITES_REMOVE: 'favorites:remove',
  FAVORITES_REORDER: 'favorites:reorder',
  FAVORITES_UPDATE_TITLE: 'favorites:update-title',
  FAVORITES_CREATE_FOLDER: 'favorites:create-folder',
  FAVORITES_MOVE: 'favorites:move',
  FAVORITES_UPDATE: 'favorites:update',
  FAVORITES_EXPORT_FILE: 'favorites:export-file',

  TAB_CREATE_SECURE: 'tab:create-secure',
  TAB_ANCHOR: 'tab:anchor',
  TAB_UNANCHOR: 'tab:unanchor',
  TAB_RESTORE_ANCHORED_URL: 'tab:restore-anchored-url',
  TAB_REPLACE_ANCHORED_URL: 'tab:replace-anchored-url',
  TAB_LIST_ANCHORED: 'tab:list-anchored',

  ADBLOCKER_GET_STATUS: 'adblocker:get-status',
  ADBLOCKER_TOGGLE_SITE: 'adblocker:toggle-site',
  ADBLOCKER_RELOAD_TAB: 'adblocker:reload-tab',
  ADBLOCKER_LIST_EXCEPTIONS: 'adblocker:list-exceptions',
  ADBLOCKER_REMOVE_EXCEPTION: 'adblocker:remove-exception',
  ADBLOCKER_UPDATE_LISTS: 'adblocker:update-lists',
  ADBLOCKER_OPEN_PANEL: 'adblocker:open-panel',
  ADBLOCKER_CLOSE_PANEL: 'adblocker:close-panel',

  VAULT_LIST: 'vault:list',
  VAULT_SEARCH: 'vault:search',
  VAULT_GET_FOR_DOMAIN: 'vault:get-for-domain',
  VAULT_RETRIEVE: 'vault:retrieve',
  VAULT_SAVE: 'vault:save',
  VAULT_UPDATE: 'vault:update',
  VAULT_DELETE: 'vault:delete',
  VAULT_FILL: 'vault:fill',
  VAULT_MARK_USED: 'vault:mark-used',
  VAULT_OPEN_SAVE_MODAL: 'vault:open-save-modal',
  VAULT_CLOSE_SAVE_MODAL: 'vault:close-save-modal',
  VAULT_OPEN_AUTOFILL_MODAL: 'vault:open-autofill-modal',
  VAULT_CLOSE_AUTOFILL_MODAL: 'vault:close-autofill-modal',
  VAULT_EXPORT: 'vault:export',
  VAULT_IMPORT_CSV: 'vault:import-csv',
  VAULT_IS_UNLOCKED: 'vault:is-unlocked',
  VAULT_LIST_FOLDERS: 'vault:list-folders',
  VAULT_OPEN_PENDING_SAVE_MODAL: 'vault:open-pending-save-modal',
  VAULT_OPEN_MANAGER: 'vault:open-manager',
  VAULT_OPEN_AND_FILL: 'vault:open-and-fill',
  VAULT_COUNT_FOR_DOMAIN: 'vault:count-for-domain',

  SCRIPTS_LIST: 'scripts:list',
  SCRIPTS_ADD: 'scripts:add',
  SCRIPTS_UPDATE: 'scripts:update',
  SCRIPTS_DELETE: 'scripts:delete',
  SCRIPTS_TOGGLE: 'scripts:toggle',
  SCRIPTS_TEST: 'scripts:test',
  SCRIPTS_IMPORT_URL: 'scripts:import-url',

  BUG_SNAPSHOT_CAPTURE: 'bug-snapshot:capture',
  BUG_SNAPSHOT_SHOW_IN_FOLDER: 'bug-snapshot:show-in-folder',
  BUG_SNAPSHOT_OPEN_FILE: 'bug-snapshot:open-file',

  RESOURCES_GET_ALL: 'resources:get-all',

  APAREJOS_GET_ALL: 'aparejos:get-all',
  APAREJOS_SET: 'aparejos:set',

  URLBAR_GET_CONFIG: 'urlbar:get-config',
  URLBAR_SET_CONFIG: 'urlbar:set-config',

  TITLEBAR_GET_CONFIG: 'titlebar:get-config',
  TITLEBAR_SET_CONFIG: 'titlebar:set-config',

  DEVTOOLS_OPEN_RESPONSIVE: 'devtools:open-responsive',
  DEVTOOLS_CLOSE_RESPONSIVE: 'devtools:close-responsive',

  SYNC_REQUEST_MAGIC_LINK: 'sync:request-magic-link',
  SYNC_SETUP: 'sync:setup',
  SYNC_GET_STATUS: 'sync:get-status',
  SYNC_NOW: 'sync:sync-now',
  SYNC_GET_DEVICES: 'sync:get-devices',
  SYNC_DISCONNECT_DEVICE: 'sync:disconnect-device',
  SYNC_DEACTIVATE: 'sync:deactivate',
  SYNC_UPDATE_DEVICE_NAME: 'sync:update-device-name',
  RECOVERY_CARD_DOWNLOAD_PDF: 'recovery-card:download-pdf',

  SECURITY_OPEN_POPUP: 'security:open-popup',
  SECURITY_CLOSE_POPUP: 'security:close-popup',

  NOTIFICATION_PERMISSION_OPEN_POPUP: 'notification-permission:open-popup',
  NOTIFICATION_PERMISSION_CLOSE_POPUP: 'notification-permission:close-popup',

  DEVMODE_OPEN_POPUP: 'devmode:open-popup',
  DEVMODE_CLOSE_POPUP: 'devmode:close-popup',
  DEVMODE_TOGGLE_RESPONSIVE: 'devmode:toggle-responsive',
  DEVMODE_TOGGLE_EMULATION: 'devmode:toggle-emulation',

  SUGGESTIONS_POPUP_OPEN: 'suggestions-popup:open',
  SUGGESTIONS_POPUP_UPDATE: 'suggestions-popup:update',
  SUGGESTIONS_POPUP_CLOSE: 'suggestions-popup:close',
  SUGGESTIONS_POPUP_SELECT: 'suggestions-popup:select',

  WORKSPACE_DROPDOWN_OPEN: 'workspace-dropdown:open',
  WORKSPACE_DROPDOWN_CLOSE: 'workspace-dropdown:close',
  WORKSPACE_DROPDOWN_TRIGGER_MODAL: 'workspace-dropdown:trigger-modal',

  PROFILE_DROPDOWN_OPEN: 'profile-dropdown:open',
  PROFILE_DROPDOWN_CLOSE: 'profile-dropdown:close',
  PROFILE_DROPDOWN_TRIGGER_MODAL: 'profile-dropdown:trigger-modal',

  VELA_MENU_OPEN: 'vela-menu:open',
  VELA_MENU_CLOSE: 'vela-menu:close',
  VELA_MENU_NAVIGATE: 'vela-menu:navigate',

  ADD_NODE_MENU_OPEN: 'add-node-menu:open',
  ADD_NODE_MENU_ACTION: 'add-node-menu:action',

  DOWNLOADS_GET_ALL: 'downloads:get-all',
  DOWNLOADS_PAUSE: 'downloads:pause',
  DOWNLOADS_RESUME: 'downloads:resume',
  DOWNLOADS_CANCEL: 'downloads:cancel',
  DOWNLOADS_REMOVE: 'downloads:remove',
  DOWNLOADS_CLEAR_COMPLETED: 'downloads:clear-completed',
  DOWNLOADS_SHOW_IN_FOLDER: 'downloads:show-in-folder',
  DOWNLOADS_OPEN_FILE: 'downloads:open-file',
  DOWNLOADS_OPEN_FOLDER: 'downloads:open-folder',

  DOWNLOAD_POPUP_OPEN: 'download-popup:open',
  DOWNLOAD_POPUP_CLOSE: 'download-popup:close',

  TAB_PREVIEW_SHOW: 'tab-preview:show',
  TAB_PREVIEW_UPDATE: 'tab-preview:update',
  TAB_PREVIEW_HIDE: 'tab-preview:hide',

  WINDOW_NEW_SAME_PROFILE: 'window:new-same-profile',
  WINDOW_SET_WORKSPACE: 'window:set-workspace',
  WINDOW_GET_ALL_FOR_PROFILE: 'window:get-all-for-profile',
  WINDOW_FOCUS: 'window:focus',
  WINDOW_GET_CURRENT_ID: 'window:get-current-id',

  ANALYTICS_DEBUGGER_OPEN: 'analytics-debugger:open',
  ANALYTICS_DEBUGGER_CLOSE: 'analytics-debugger:close',
  ANALYTICS_DEBUGGER_CLEAR: 'analytics-debugger:clear',
  ANALYTICS_DEBUGGER_GET_EVENTS: 'analytics-debugger:get-events',
  ANALYTICS_DEBUGGER_DATALAYER_PUSH: 'analytics-debugger:datalayer-push',
  ANALYTICS_DEBUGGER_NET_BODY: 'analytics-debugger:net-body',

  TOOLS_CLUSTER_OPEN: 'tools-cluster:open',
  TOOLS_CLUSTER_CLOSE: 'tools-cluster:close',
  STATUS_CLUSTER_OPEN: 'status-cluster:open',
  STATUS_CLUSTER_CLOSE: 'status-cluster:close',
  CLUSTER_RELAY_ACTION: 'cluster:relay-action',

  FIND_BAR_OPEN: 'find-bar:open',
  FIND_BAR_CLOSE: 'find-bar:close',

  DEFAULT_BROWSER_GET_STATUS: 'default-browser:get-status',
  DEFAULT_BROWSER_SET: 'default-browser:set',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const IPC_EVENTS = {
  WORKSPACES_CHANGED: 'state:workspaces-changed',
  TREE_CHANGED: 'state:tree-changed',
  ACTIVE_TAB_CHANGED: 'state:active-tab-changed',
  ACTIVE_WORKSPACE_CHANGED: 'state:active-workspace-changed',
  RULES_CHANGED: 'state:rules-changed',
  COMMAND_RENDERER_ACTION: 'state:command-renderer-action',
  TAB_NAVIGATED: 'state:tab-navigated',
  TAB_LOADING_CHANGED: 'state:tab-loading-changed',
  PROFILES_CHANGED: 'state:profiles-changed',
  ACTIVE_PROFILE_CHANGED: 'state:active-profile-changed',
  PROFILE_LOCKED: 'state:profile-locked',
  PROFILE_UNLOCKED: 'state:profile-unlocked',
  WINDOW_MAXIMIZED_CHANGED: 'state:window-maximized-changed',
  FULLSCREEN_CHANGED: 'state:fullscreen-changed',
  TAB_READER_STATE_CHANGED: 'state:tab-reader-state-changed',
  TAB_FEATURES_CHANGED: 'state:tab-features-changed',
  NOTIFICATIONS_CHANGED: 'state:notifications-changed',
  NOTIFICATION_PERMISSION_PENDING: 'state:notification-permission-pending',
  NOTIFICATION_PERMISSION_CHANGED: 'state:notification-permission-changed',
  NOTIFICATION_CENTER_OPEN: 'state:notification-center-open',
  EXTENSION_ACTIONS_CHANGED: 'state:extension-actions-changed',
  UI_SETTINGS_CHANGED: 'state:ui-settings-changed',
  CONTEXT_MENU_SHOW: 'state:context-menu-show',
  LAYOUT_CHANGED: 'state:layout-changed',
  MEDIA_CHANGED: 'state:media-changed',
  HOVER_URL_CHANGED: 'state:hover-url-changed',
  SHORTCUTS_SYSTEM_CHANGED: 'state:shortcuts-system-changed',
  COOKIES_CHANGED: 'state:cookies-changed',
  FAVORITES_CHANGED: 'state:favorites-changed',
  ANCHORED_TABS_CHANGED: 'anchored-tabs-changed',
  ADBLOCKER_COUNT_UPDATED: 'state:adblocker-count-updated',
  VAULT_CREDENTIALS_PENDING: 'state:vault-credentials-pending',
  SCRIPT_ERROR: 'state:script-error',
  APAREJOS_CHANGED: 'state:aparejos-changed',
  URLBAR_CONFIG_CHANGED: 'state:urlbar-config-changed',
  TITLEBAR_CONFIG_CHANGED: 'state:titlebar-config-changed',
  SYNC_STATUS_CHANGED: 'state:sync-status-changed',
  SYNC_SESSION_EXPIRED: 'sync:session-expired',
  SYNC_CALLBACK_RECEIVED: 'sync:callback-received',
  SUGGESTIONS_POPUP_SELECTED: 'state:suggestions-popup-selected',
  SUGGESTIONS_POPUP_DATA: 'suggestions-popup:data',
  DEVICE_EMULATION_TOGGLE_REQUEST: 'state:device-emulation-toggle-request',
  WORKSPACE_MODAL_TRIGGER: 'state:workspace-modal-trigger',
  PROFILE_MODAL_TRIGGER: 'state:profile-modal-trigger',
  BUG_SNAPSHOT_COMPLETE: 'state:bug-snapshot-complete',
  ADD_NODE_MENU_ACTION: 'state:add-node-menu-action',
  DOWNLOADS_CHANGED: 'state:downloads-changed',
  UPDATE_CHECKING: 'state:update-checking',
  UPDATE_AVAILABLE: 'state:update-available',
  UPDATE_NOT_AVAILABLE: 'state:update-not-available',
  UPDATE_DOWNLOAD_PROGRESS: 'state:update-download-progress',
  UPDATE_DOWNLOADED: 'state:update-downloaded',
  UPDATE_ERROR: 'state:update-error',
  TAB_PREVIEW_DATA: 'state:tab-preview-data',
  WINDOW_WORKSPACE_CHANGED: 'state:window-workspace-changed',
  WINDOWS_CHANGED: 'state:windows-changed',
  ANALYTICS_DEBUGGER_HIT: 'state:analytics-debugger-hit',
  CLUSTER_RELAY: 'state:cluster-relay',
  FIND_RESULT: 'state:find-result',
  FIND_BAR_QUERY_SYNC: 'state:find-bar-query-sync',
  FIND_BAR_CLOSED: 'state:find-bar-closed',
} as const;

export type IpcEvent = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];

export interface MainEventPayloads {
  [IPC_EVENTS.WORKSPACES_CHANGED]: void;
  [IPC_EVENTS.TREE_CHANGED]: { workspaceId: string };
  [IPC_EVENTS.ACTIVE_TAB_CHANGED]: { windowId: number; tabId: string | null };
  [IPC_EVENTS.ACTIVE_WORKSPACE_CHANGED]: {
    windowId: number;
    workspaceId: string;
  };
  [IPC_EVENTS.RULES_CHANGED]: { workspaceId: string };
  [IPC_EVENTS.COMMAND_RENDERER_ACTION]: CommandRendererActionPayload;
  [IPC_EVENTS.TAB_NAVIGATED]: {
    tabId: string;
    url: string;
    canGoBack: boolean;
    canGoForward: boolean;
  };
  [IPC_EVENTS.TAB_LOADING_CHANGED]: {
    tabId: string;
    loading: boolean;
  };
  [IPC_EVENTS.PROFILES_CHANGED]: void;
  [IPC_EVENTS.ACTIVE_PROFILE_CHANGED]: {
    windowId: number;
    profileId: string;
  };
  [IPC_EVENTS.PROFILE_LOCKED]: { profileId: string };
  [IPC_EVENTS.PROFILE_UNLOCKED]: { profileId: string };
  [IPC_EVENTS.WINDOW_MAXIMIZED_CHANGED]: { windowId: number; maximized: boolean };
  [IPC_EVENTS.FULLSCREEN_CHANGED]: { windowId: number; fullscreen: boolean };
  [IPC_EVENTS.TAB_READER_STATE_CHANGED]: { tabId: string; readable: boolean; windowId: number };
  [IPC_EVENTS.TAB_FEATURES_CHANGED]: {
    tabId: string;
    windowId: number;
    features: Array<'rss' | 'form' | 'media'>;
  };
  [IPC_EVENTS.NOTIFICATIONS_CHANGED]: { profileId: string; unreadCount: number };
  [IPC_EVENTS.NOTIFICATION_PERMISSION_PENDING]: { origin: string; windowId: number; hasPushRequest: boolean };
  [IPC_EVENTS.NOTIFICATION_PERMISSION_CHANGED]: {
    origin: string;
    state: NotificationPermissionState;
    windowId: number;
  };
  [IPC_EVENTS.NOTIFICATION_CENTER_OPEN]: Record<string, never>;
  [IPC_EVENTS.EXTENSION_ACTIONS_CHANGED]: void;
  [IPC_EVENTS.UI_SETTINGS_CHANGED]: { key: string; value: unknown };
  [IPC_EVENTS.CONTEXT_MENU_SHOW]: ContextMenuShowPayload;
  [IPC_EVENTS.LAYOUT_CHANGED]: { windowId: number; layout: WindowLayout };
  [IPC_EVENTS.MEDIA_CHANGED]: { sources: MediaSource[] };
  [IPC_EVENTS.HOVER_URL_CHANGED]: { tabId: string; url: string | null; isExternal: boolean };
  [IPC_EVENTS.SHORTCUTS_SYSTEM_CHANGED]: void;
  [IPC_EVENTS.COOKIES_CHANGED]: { tabId: string; domain: string };
  [IPC_EVENTS.FAVORITES_CHANGED]: { profileId: string; favorites: Favorite[] };
  [IPC_EVENTS.ANCHORED_TABS_CHANGED]: { profileId: string; tabs: TabNode[] };
  [IPC_EVENTS.ADBLOCKER_COUNT_UPDATED]: { tabId: string; counts: AdBlockerCounts };
  [IPC_EVENTS.VAULT_CREDENTIALS_PENDING]: {
    windowId: number;
    tabId: string;
    domain: string;
    loginUrl: string;
    username: string;
    hasExisting: boolean;
    existingId: string | null;
  };
  [IPC_EVENTS.SCRIPT_ERROR]: ScriptError;
  [IPC_EVENTS.APAREJOS_CHANGED]: { aparejos: AparejoStatus[] };
  [IPC_EVENTS.URLBAR_CONFIG_CHANGED]: { config: UrlBarIconConfig[] };
  [IPC_EVENTS.TITLEBAR_CONFIG_CHANGED]: { config: TitleBarIconConfig[] };
  [IPC_EVENTS.SYNC_STATUS_CHANGED]: { profileId: string; status: SyncStatus };
  [IPC_EVENTS.SYNC_SESSION_EXPIRED]: { profileId: string };
  [IPC_EVENTS.SYNC_CALLBACK_RECEIVED]: { token: string };
  [IPC_EVENTS.SUGGESTIONS_POPUP_SELECTED]: { suggestion: ExtendedSuggestion; newTab: boolean; windowId: number };
  [IPC_EVENTS.SUGGESTIONS_POPUP_DATA]: { suggestions: ExtendedSuggestion[]; selectedIndex: number };
  [IPC_EVENTS.DEVICE_EMULATION_TOGGLE_REQUEST]: void;
  [IPC_EVENTS.WORKSPACE_MODAL_TRIGGER]: { mode: 'create' | 'manage' | 'edit'; editId?: string };
  [IPC_EVENTS.PROFILE_MODAL_TRIGGER]: { mode: 'create' | 'manage' | 'unlock'; profileId?: string };
  [IPC_EVENTS.BUG_SNAPSHOT_COMPLETE]: { zipPath: string };
  [IPC_EVENTS.ADD_NODE_MENU_ACTION]: { action: 'new-tab' | 'new-folder' | 'new-secure-tab'; workspaceId: string; parentId: string | null };
  [IPC_EVENTS.DOWNLOADS_CHANGED]: { items: DownloadItem[] };
  [IPC_EVENTS.UPDATE_CHECKING]: void;
  [IPC_EVENTS.UPDATE_AVAILABLE]: { version: string };
  [IPC_EVENTS.UPDATE_NOT_AVAILABLE]: { version: string };
  [IPC_EVENTS.UPDATE_DOWNLOAD_PROGRESS]: { percent: number; bytesPerSecond: number };
  [IPC_EVENTS.UPDATE_DOWNLOADED]: { version: string };
  [IPC_EVENTS.UPDATE_ERROR]: { message: string };
  [IPC_EVENTS.TAB_PREVIEW_DATA]: { tabId: string; profileId: string; title: string; url: string };
  [IPC_EVENTS.WINDOW_WORKSPACE_CHANGED]: { workspaceId: string | null };
  [IPC_EVENTS.WINDOWS_CHANGED]: { windows: WindowInfo[] };
  [IPC_EVENTS.ANALYTICS_DEBUGGER_HIT]: { hit: import('./types/analyticsDebugger').AnalyticsHit };
  [IPC_EVENTS.CLUSTER_RELAY]: { action: string; payload: Record<string, unknown> };
  [IPC_EVENTS.FIND_RESULT]: { current: number; total: number; windowId: number };
  [IPC_EVENTS.FIND_BAR_QUERY_SYNC]: { text: string; matchCase: boolean; windowId: number };
  [IPC_EVENTS.FIND_BAR_CLOSED]: { windowId: number };
}

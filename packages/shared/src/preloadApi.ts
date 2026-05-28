import type { z } from 'zod';
import type { ContextMenuExecAction } from './types/contextMenu';
import type { WindowLayout, LayoutMode, PanelId } from './types/layout';
import type { CustomThemeExport } from './schemas/theme';
import type { DeviceEmulationParams } from './types/deviceEmulation';
import type { ShortcutCommandInfo } from './types/command';
import type {
  createProfileInputSchema,
  folderCreateInputSchema,
  folderTabCreateInputSchema,
  menuShowInputSchema,
  layoutSetAddressBarHeightInputSchema,
  layoutSetNotificationPanelWidthInputSchema,
  layoutSetOverlayInputSchema,
  layoutSidebarWidthInputSchema,
  navGotoInputSchema,
  navSimpleInputSchema,
  nodeDeleteInputSchema,
  nodeMoveInputSchema,
  nodeRenameInputSchema,
  nodeReorderInputSchema,
  nodeToggleCollapseInputSchema,
  nodeUpdateInputSchema,
  profileArchiveInputSchema,
  profileDeleteInputSchema,
  profileLockInputSchema,
  profileOpenWindowInputSchema,
  profileRemoveMasterPasswordInputSchema,
  profileReorderInputSchema,
  profileSetMasterPasswordInputSchema,
  ruleCreateInputSchema,
  ruleDeleteInputSchema,
  ruleListInputSchema,
  ruleReorderPriorityInputSchema,
  ruleUpdateInputSchema,
  runtimeGetTabNavStateInputSchema,
  settingsGetAllInputSchema,
  settingsGetInputSchema,
  settingsSetInputSchema,
  suggestQueryInputSchema,
  tabActivateInputSchema,
  tabCreateInputSchema,
  tabSimpleInputSchema,
  treeGetByWorkspaceInputSchema,
  treeNodeIdInputSchema,
  unlockProfileInputSchema,
  updateProfileInputSchema,
  windowOpenUrlInNewTabInputSchema,
  workspaceArchiveInputSchema,
  workspaceCreateInputSchema,
  workspaceDeleteInputSchema,
  workspaceReorderInputSchema,
  workspaceSetActiveInputSchema,
  workspaceUpdateInputSchema,
} from './schemas';
import type { MainEventPayloads } from './ipc-channels';
import type { IpcResponse } from './types/ipcResponse';
import type { SyncStatus, DeviceInfo } from './types/sync';
import type { SettingsKey } from './schemas/settings';
import type { FolderNode, TabNode, TreeNode } from './types/treeNode';
import type { Workspace } from './types/workspace';
import type { MenuShowResult } from './types/menu';
import type { AutoGroupRule } from './types/autoGroupRule';
import type { Suggestion } from './types/suggestion';
import type { TabRuntime } from './types/tabRuntime';
import type { Profile } from './types/profile';
import type { CustomEngineAlias } from './types/searchEngine';
import type { ExtensionAction, InstalledExtension } from './types/extension';
import type { MediaSource } from './types/media';
import type { RecentlyClosedTab } from './types/recentlyClosedTab';
import type { QuickNote, HistorySearchEntry, HistorySession, DomainStat } from './types/quickNote';
import type { Favorite } from './types/favorite';
import type { AdBlockerStatus } from './types/adblocker';
import type { VaultEntry, VaultEntrySummary } from './types/vault';
import type { UserScript, UserScriptData, UserScriptMeta } from './types/userScript';
import type { TabResource } from './types/tabResource';
import type { AparejoId, AparejoStatus } from './types/aparejo';
import type { UrlBarIconConfig } from './types/urlbar';
import type { TitleBarIconConfig } from './types/titlebar';
import type { ExtendedSuggestion } from './types/suggestion';
import type { DownloadItem } from './types/download';
import type { WindowInfo } from './types/window';

export type WorkspaceCreateInput = z.input<typeof workspaceCreateInputSchema>;
export type WorkspaceUpdateInput = z.input<typeof workspaceUpdateInputSchema>;
export type WorkspaceDeleteInput = z.input<typeof workspaceDeleteInputSchema>;
export type WorkspaceArchiveInput = z.input<typeof workspaceArchiveInputSchema>;
export type WorkspaceReorderInput = z.input<typeof workspaceReorderInputSchema>;
export type WorkspaceSetActiveInput = z.input<
  typeof workspaceSetActiveInputSchema
>;

export type SettingsGetInput = z.input<typeof settingsGetInputSchema>;
export type SettingsSetInput = z.input<typeof settingsSetInputSchema>;
export type SettingsGetAllInput = z.input<typeof settingsGetAllInputSchema>;

export type FolderCreateInput = z.input<typeof folderCreateInputSchema>;
export type FolderTabCreateInput = z.input<typeof folderTabCreateInputSchema>;
export type TabCreateInput = z.input<typeof tabCreateInputSchema>;
export type NodeUpdateInput = z.input<typeof nodeUpdateInputSchema>;
export type NodeDeleteInput = z.input<typeof nodeDeleteInputSchema>;
export type NodeMoveInput = z.input<typeof nodeMoveInputSchema>;
export type NodeReorderInput = z.input<typeof nodeReorderInputSchema>;
export type NodeToggleCollapseInput = z.input<
  typeof nodeToggleCollapseInputSchema
>;
export type NodeRenameInput = z.input<typeof nodeRenameInputSchema>;

export type TabActivateInput = z.input<typeof tabActivateInputSchema>;
export type TabSimpleInput = z.input<typeof tabSimpleInputSchema>;

export type TreeGetByWorkspaceInput = z.input<
  typeof treeGetByWorkspaceInputSchema
>;
export type TreeNodeIdInput = z.input<typeof treeNodeIdInputSchema>;

export type NavGotoInput = z.input<typeof navGotoInputSchema>;
export type NavSimpleInput = z.input<typeof navSimpleInputSchema>;

export type WindowOpenUrlInNewTabInput = z.input<
  typeof windowOpenUrlInNewTabInputSchema
>;
export type LayoutSidebarWidthInput = z.input<
  typeof layoutSidebarWidthInputSchema
>;
export type LayoutSetOverlayInput = z.input<typeof layoutSetOverlayInputSchema>;
export type LayoutSetAddressBarHeightInput = z.input<
  typeof layoutSetAddressBarHeightInputSchema
>;
export type LayoutSetNotificationPanelWidthInput = z.input<
  typeof layoutSetNotificationPanelWidthInputSchema
>;

export type SuggestQueryInput = z.input<typeof suggestQueryInputSchema>;

export type RuntimeGetTabNavStateInput = z.input<
  typeof runtimeGetTabNavStateInputSchema
>;

export type MenuShowInput = z.input<typeof menuShowInputSchema>;

export type RuleListInput = z.input<typeof ruleListInputSchema>;
export type RuleCreateInput = z.input<typeof ruleCreateInputSchema>;
export type RuleUpdateInput = z.input<typeof ruleUpdateInputSchema>;
export type RuleDeleteInput = z.input<typeof ruleDeleteInputSchema>;
export type RuleReorderPriorityInput = z.input<
  typeof ruleReorderPriorityInputSchema
>;

export type ProfileCreateInput = z.input<typeof createProfileInputSchema>;
export type ProfileUpdateInput = z.input<typeof updateProfileInputSchema>;
export type ProfileDeleteInput = z.input<typeof profileDeleteInputSchema>;
export type ProfileArchiveInput = z.input<typeof profileArchiveInputSchema>;
export type ProfileReorderInput = z.input<typeof profileReorderInputSchema>;
export type ProfileUnlockInput = z.input<typeof unlockProfileInputSchema>;
export type ProfileLockInput = z.input<typeof profileLockInputSchema>;
export type ProfileSetMasterPasswordInput = z.input<
  typeof profileSetMasterPasswordInputSchema
>;
export type ProfileRemoveMasterPasswordInput = z.input<
  typeof profileRemoveMasterPasswordInputSchema
>;
export type ProfileOpenWindowInput = z.input<
  typeof profileOpenWindowInputSchema
>;

export interface WorkspacesApi {
  list(): Promise<IpcResponse<Workspace[]>>;
  listAll(): Promise<IpcResponse<Workspace[]>>;
  getActive(): Promise<IpcResponse<{ id: string | null }>>;
  setActive(
    input: WorkspaceSetActiveInput,
  ): Promise<IpcResponse<{ id: string }>>;
  create(input: WorkspaceCreateInput): Promise<IpcResponse<Workspace>>;
  update(input: WorkspaceUpdateInput): Promise<IpcResponse<Workspace>>;
  delete(input: WorkspaceDeleteInput): Promise<IpcResponse<{ id: string }>>;
  archive(input: WorkspaceArchiveInput): Promise<IpcResponse<Workspace>>;
  reorder(input: WorkspaceReorderInput): Promise<IpcResponse<Workspace>>;
}

export interface NodeApi {
  createFolder(input: FolderCreateInput): Promise<IpcResponse<FolderNode>>;
  createFolderTab(input: FolderTabCreateInput): Promise<IpcResponse<TabNode>>;
  createTab(input: TabCreateInput): Promise<IpcResponse<TabNode>>;
  update(input: NodeUpdateInput): Promise<IpcResponse<TreeNode>>;
  delete(input: NodeDeleteInput): Promise<IpcResponse<{ id: string }>>;
  move(input: NodeMoveInput): Promise<IpcResponse<TreeNode>>;
  reorder(input: NodeReorderInput): Promise<IpcResponse<TreeNode>>;
  toggleCollapse(
    input: NodeToggleCollapseInput,
  ): Promise<IpcResponse<TreeNode>>;
  rename(input: NodeRenameInput): Promise<IpcResponse<TreeNode>>;
}

export interface TabApi {
  activate(input: TabActivateInput): Promise<IpcResponse<{ id: string }>>;
  close(input: TabSimpleInput): Promise<IpcResponse<{ id: string }>>;
  discard(input: TabSimpleInput): Promise<IpcResponse<TabNode>>;
  restore(input: TabSimpleInput): Promise<IpcResponse<TabNode>>;
  pin(input: TabSimpleInput): Promise<IpcResponse<TabNode>>;
  unpin(input: TabSimpleInput): Promise<IpcResponse<TabNode>>;
  restorePinnedUrl(input: TabSimpleInput): Promise<IpcResponse<void>>;
  replacePinnedUrl(input: TabSimpleInput): Promise<IpcResponse<void>>;
  recentlyClosed(): Promise<IpcResponse<RecentlyClosedTab[]>>;
  reopenById(input: { closedTabId: string }): Promise<IpcResponse<{ id: string }>>;
  anchor(input: TabSimpleInput): Promise<IpcResponse<TabNode>>;
  unanchor(input: TabSimpleInput): Promise<IpcResponse<TabNode>>;
  restoreAnchoredUrl(input: TabSimpleInput): Promise<IpcResponse<void>>;
  replaceAnchoredUrl(input: TabSimpleInput): Promise<IpcResponse<void>>;
  listAnchored(): Promise<IpcResponse<TabNode[]>>;
  createSecure(input: { url?: string }): Promise<IpcResponse<{ id: string }>>;
}

export interface TreeApi {
  getByWorkspace(
    input: TreeGetByWorkspaceInput,
  ): Promise<IpcResponse<TreeNode[]>>;
  getDescendants(input: TreeNodeIdInput): Promise<IpcResponse<TreeNode[]>>;
  getAncestors(input: TreeNodeIdInput): Promise<IpcResponse<TreeNode[]>>;
}

export interface NavApi {
  back(input: NavSimpleInput): Promise<IpcResponse<{ id: string }>>;
  forward(input: NavSimpleInput): Promise<IpcResponse<{ id: string }>>;
  reload(input: NavSimpleInput): Promise<IpcResponse<{ id: string }>>;
  stop(input: NavSimpleInput): Promise<IpcResponse<{ id: string }>>;
  goto(input: NavGotoInput): Promise<IpcResponse<{ id: string }>>;
  setAddressBarEditing(input: { editing: boolean }): Promise<IpcResponse<void>>;
}

export interface WindowApi {
  openUrlInNewTab(
    input: WindowOpenUrlInNewTabInput,
  ): Promise<IpcResponse<TabNode>>;
  minimize(): Promise<IpcResponse<void>>;
  toggleMaximize(): Promise<IpcResponse<void>>;
  close(): Promise<IpcResponse<void>>;
  isMaximized(): Promise<IpcResponse<{ maximized: boolean }>>;
  updateTitleBarOverlay(opts: { color: string; symbolColor: string }): Promise<IpcResponse<void>>;
  toggleFullscreen(): Promise<IpcResponse<void>>;
  isFullscreen(): Promise<IpcResponse<{ fullscreen: boolean }>>;
  newSameProfile(): Promise<IpcResponse<{ windowId: string }>>;
  setWorkspace(input: { workspaceId: string }): Promise<IpcResponse<void>>;
  getAllForProfile(): Promise<IpcResponse<WindowInfo[]>>;
  focus(input: { windowId: string }): Promise<IpcResponse<void>>;
  getCurrentId(): Promise<IpcResponse<{ windowId: string; isPrimary: boolean }>>;
}

export interface LayoutApi {
  setSidebarWidth(
    input: LayoutSidebarWidthInput,
  ): Promise<IpcResponse<{ width: number }>>;
  setOverlay(
    input: LayoutSetOverlayInput,
  ): Promise<IpcResponse<{ active: boolean }>>;
  setAddressBarHeight(
    input: LayoutSetAddressBarHeightInput,
  ): Promise<IpcResponse<{ height: number }>>;
  setNotificationPanelWidth(
    input: LayoutSetNotificationPanelWidthInput,
  ): Promise<IpcResponse<{ width: number }>>;
  setSplit(input: { mode: LayoutMode; tabIdForNewPanel?: string }): Promise<IpcResponse<WindowLayout>>;
  closeSplit(): Promise<IpcResponse<WindowLayout>>;
  setRatio(input: { ratio: number }): Promise<IpcResponse<void>>;
  setFocusedPanel(input: { panelId: PanelId }): Promise<IpcResponse<void>>;
  getLayout(): Promise<IpcResponse<WindowLayout>>;
  openTabInUnfocusedPanel(input: { tabId: string; windowId: number }): Promise<IpcResponse<void>>;
}

export interface SuggestApi {
  query(input: SuggestQueryInput): Promise<IpcResponse<Suggestion[]>>;
}

export interface FrameContext {
  windowId: number;
  profileId: string;
  activeTabId: string | null;
}

export interface AppVersions {
  app: string;
  electron: string;
  chromium: string;
  node: string;
}

export interface RuntimeApi {
  getWindowId(): Promise<IpcResponse<{ windowId: number }>>;
  getTabNavState(
    input: RuntimeGetTabNavStateInput,
  ): Promise<IpcResponse<TabRuntime | null>>;
  getVersions(): Promise<IpcResponse<AppVersions>>;
  getBackgroundMaterial(): Promise<IpcResponse<{ supported: boolean }>>;
  openExternal(input: { url: string }): Promise<IpcResponse<void>>;
}

export interface UpdateApi {
  checkNow(): Promise<IpcResponse<void>>;
  download(): Promise<IpcResponse<void>>;
  quitAndInstall(): Promise<IpcResponse<void>>;
}

export interface ThemeApi {
  exportFile(payload: { theme: CustomThemeExport; name: string }): Promise<IpcResponse<void>>;
}

export interface ReaderApi {
  fetchHtml(input: { url: string }): Promise<IpcResponse<{ html: string }>>;
}

export interface ShortcutsApi {
  getAll(): Promise<IpcResponse<ShortcutCommandInfo[]>>;
  set(input: { commandId: string; shortcut: string | null }): Promise<IpcResponse<void>>;
  resetAll(): Promise<IpcResponse<void>>;
  resetOne(input: { commandId: string }): Promise<IpcResponse<void>>;
  export(): Promise<IpcResponse<void>>;
  import(): Promise<IpcResponse<{ imported: number; conflicts: string[] }>>;
}

export interface DevtoolsApi {
  setEmulation(params: DeviceEmulationParams): Promise<IpcResponse<void>>;
  clearEmulation(): Promise<IpcResponse<void>>;
  openResponsive(): Promise<IpcResponse<void>>;
  closeResponsive(): Promise<IpcResponse<void>>;
}

export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  fingerprint: string;
}

export interface SecurityApi {
  getCertificate(input: { windowId: number }): Promise<IpcResponse<CertificateInfo | null>>;
  openPopup(input: { windowId: number; scheme: string; rawUrl: string; anchorRect: { left: number; bottom: number; width: number } }): Promise<IpcResponse<void>>;
  closePopup(input: { windowId: number }): Promise<IpcResponse<void>>;
}

export interface DevModeApi {
  openPopup(input: { windowId: number; activeTabId: string | null; currentUrl: string; devtoolsActive: boolean; anchorRect: { right: number; bottom: number } }): Promise<IpcResponse<void>>;
  closePopup(input: { windowId: number }): Promise<IpcResponse<void>>;
  toggleResponsive(input: { parentWindowId: number }): Promise<IpcResponse<void>>;
  toggleEmulation(input: { parentWindowId: number }): Promise<IpcResponse<void>>;
}

export interface SuggestionsPopupApi {
  open(input: { windowId: number; anchorRect: { left: number; bottom: number; width: number }; suggestions: ExtendedSuggestion[]; selectedIndex: number }): Promise<IpcResponse<void>>;
  update(input: { windowId: number; suggestions: ExtendedSuggestion[]; selectedIndex: number }): Promise<IpcResponse<void>>;
  close(input: { windowId: number }): Promise<IpcResponse<void>>;
  select(input: { suggestion: ExtendedSuggestion; newTab: boolean }): Promise<IpcResponse<void>>;
}

export interface SearchEnginesApi {
  getCustomEngines(): Promise<IpcResponse<CustomEngineAlias[]>>;
  setCustomEngine(engine: CustomEngineAlias): Promise<IpcResponse<CustomEngineAlias[]>>;
  deleteCustomEngine(alias: string): Promise<IpcResponse<CustomEngineAlias[]>>;
}

export interface CommandsApi {
  execute(commandId: string, opts?: { args?: unknown; targetWindowId?: number }): Promise<IpcResponse<void>>;
}

export interface VelaMenuApi {
  open(args: { windowId: number; anchorRect: { left: number; bottom: number } }): Promise<IpcResponse<void>>;
  close(args: { windowId: number }): Promise<IpcResponse<void>>;
  navigate(args: { windowId: number; url: string }): Promise<IpcResponse<void>>;
}

export interface ScreenshotCaptureResult {
  dataUrl: string;
}

export interface ScreenshotApi {
  captureVisible(): Promise<IpcResponse<ScreenshotCaptureResult>>;
  captureRegion(region: { x: number; y: number; width: number; height: number }): Promise<IpcResponse<ScreenshotCaptureResult>>;
  captureFullPage(): Promise<IpcResponse<ScreenshotCaptureResult>>;
  saveFile(opts: { dataUrl: string; format: 'png' | 'jpeg' }): Promise<IpcResponse<{ saved: boolean }>>;
  copyImage(dataUrl: string): Promise<IpcResponse<void>>;
}

export interface MruApi {
  confirm(input: { tabId: string }): Promise<IpcResponse<void>>;
}

export interface WhitelistStatus {
  permanent: boolean;
  workspace: boolean;
  folder: boolean;
}

export interface ContextMenuApi {
  exec(action: ContextMenuExecAction): Promise<IpcResponse<void>>;
}

export interface RecentFile {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  usedAt: number;
}

export interface DownloadFile {
  name: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  modifiedAt: number;
}

export interface FilePickerShowInput {
  accept: string;
  multiple: boolean;
  inputRect: { x: number; y: number; width: number; height: number };
  pickerId: string;
}

export interface FilePickerApi {
  show(input: FilePickerShowInput): Promise<IpcResponse<void>>;
  select(input: { windowId: number; profileId: string; paths: string[]; pickerId: string }): Promise<IpcResponse<void>>;
  openNative(input: { windowId: number; profileId: string; accept: string; multiple: boolean; pickerId: string }): Promise<IpcResponse<{ paths: string[] }>>;
  listRecent(input: { profileId: string; limit: number; accept: string }): Promise<IpcResponse<RecentFile[]>>;
  listDownloads(input: { limit: number; accept: string }): Promise<IpcResponse<DownloadFile[]>>;
  clipboardImage(): Promise<IpcResponse<{ dataUrl: string | null }>>;
  cancel(input: { windowId: number }): Promise<IpcResponse<void>>;
  clearRecent(input: { profileId: string }): Promise<IpcResponse<void>>;
}

export interface GlanceAnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
  bottom: number;
}

export interface GlanceApi {
  close(): Promise<IpcResponse<void>>;
  openInTab(input: { url: string; windowId: number }): Promise<IpcResponse<void>>;
  openInSplit(input: { url: string; windowId: number }): Promise<IpcResponse<void>>;
}

export interface MediaApi {
  getSources(): Promise<IpcResponse<MediaSource[]>>;
  play(input: { tabId: string }): Promise<IpcResponse<void>>;
  pause(input: { tabId: string }): Promise<IpcResponse<void>>;
  openPopup(input: { x: number; y: number }): Promise<IpcResponse<null>>;
  closePopup(): Promise<IpcResponse<null>>;
  skipNext(input: { tabId: string }): Promise<IpcResponse<void>>;
  skipPrev(input: { tabId: string }): Promise<IpcResponse<void>>;
  activateTab(input: { tabId: string; windowId: number }): Promise<IpcResponse<void>>;
  getCurrentTime(input: { tabId: string }): Promise<IpcResponse<{ currentTime: number; duration: number | null }>>;
  seekBy(input: { tabId: string; delta: number }): Promise<IpcResponse<void>>;
}

export interface DiscardApi {
  discardTab(input: { tabId: string }): Promise<IpcResponse<void>>;
  discardFolder(input: { folderId: string }): Promise<IpcResponse<void>>;
  discardWorkspace(input: { workspaceId: string }): Promise<IpcResponse<void>>;
  restoreTab(input: { tabId: string }): Promise<IpcResponse<void>>;
  restoreWorkspace(input: { workspaceId: string }): Promise<IpcResponse<void>>;
  togglePermanentWhitelist(input: { tabId: string }): Promise<IpcResponse<{ whitelisted: boolean }>>;
  toggleWorkspaceWhitelist(input: { workspaceId: string }): Promise<IpcResponse<{ whitelisted: boolean }>>;
  toggleFolderWhitelist(input: { folderId: string }): Promise<IpcResponse<{ whitelisted: boolean }>>;
  getWhitelistStatus(input: { tabId: string }): Promise<IpcResponse<WhitelistStatus>>;
}

export interface ExtensionAnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtensionsApi {
  getActions(): Promise<IpcResponse<ExtensionAction[]>>;
  openPopup(input: { extensionId: string; anchorRect: ExtensionAnchorRect }): Promise<IpcResponse<void>>;
  listInstalled(): Promise<IpcResponse<InstalledExtension[]>>;
  enable(input: { extensionId: string }): Promise<IpcResponse<void>>;
  disable(input: { extensionId: string }): Promise<IpcResponse<void>>;
  uninstall(input: { extensionId: string }): Promise<IpcResponse<void>>;
  installFromCrx(): Promise<IpcResponse<InstalledExtension>>;
  installFromPath(input: { filePath: string }): Promise<IpcResponse<InstalledExtension>>;
  openOptionsPage(input: { extensionId: string }): Promise<IpcResponse<void>>;
  setPinned(input: { extensionId: string; pinned: boolean }): Promise<IpcResponse<void>>;
  setSecureAllowed(input: { extensionId: string; allowed: boolean }): Promise<IpcResponse<void>>;
}

export interface SettingsApi {
  get(input: SettingsGetInput): Promise<IpcResponse<{ value: unknown }>>;
  set(input: SettingsSetInput): Promise<IpcResponse<{ key: SettingsKey }>>;
  getAll(
    input?: SettingsGetAllInput,
  ): Promise<IpcResponse<Record<SettingsKey, unknown>>>;
}

export interface MenuApi {
  show(input: MenuShowInput): Promise<IpcResponse<MenuShowResult>>;
}

export interface RuleApi {
  list(input: RuleListInput): Promise<IpcResponse<AutoGroupRule[]>>;
  create(input: RuleCreateInput): Promise<IpcResponse<AutoGroupRule>>;
  update(input: RuleUpdateInput): Promise<IpcResponse<AutoGroupRule>>;
  delete(input: RuleDeleteInput): Promise<IpcResponse<{ id: string }>>;
  reorderPriority(
    input: RuleReorderPriorityInput,
  ): Promise<IpcResponse<AutoGroupRule[]>>;
}

export interface ProfileUnlockResult {
  ok: true;
  profileId: string;
}

export interface ProfileApi {
  list(): Promise<IpcResponse<Profile[]>>;
  listArchived(): Promise<IpcResponse<Profile[]>>;
  getActive(): Promise<IpcResponse<{ profileId: string | null }>>;
  create(input: ProfileCreateInput): Promise<IpcResponse<Profile>>;
  update(input: ProfileUpdateInput): Promise<IpcResponse<Profile>>;
  delete(input: ProfileDeleteInput): Promise<IpcResponse<{ id: string }>>;
  archive(input: ProfileArchiveInput): Promise<IpcResponse<Profile>>;
  reorder(input: ProfileReorderInput): Promise<IpcResponse<Profile>>;
  unlock(input: ProfileUnlockInput): Promise<IpcResponse<ProfileUnlockResult>>;
  lock(input: ProfileLockInput): Promise<IpcResponse<{ id: string }>>;
  setMasterPassword(
    input: ProfileSetMasterPasswordInput,
  ): Promise<IpcResponse<Profile>>;
  removeMasterPassword(
    input: ProfileRemoveMasterPasswordInput,
  ): Promise<IpcResponse<Profile>>;
  openWindow(
    input: ProfileOpenWindowInput,
  ): Promise<IpcResponse<{ windowId: number }>>;
  clearData(): Promise<IpcResponse<void>>;
}

export type EventListener<E extends keyof MainEventPayloads> = (
  payload: MainEventPayloads[E] extends void ? undefined : MainEventPayloads[E],
) => void;

export interface NotesApi {
  get(input: { workspaceId: string }): Promise<IpcResponse<QuickNote | null>>;
  save(input: { workspaceId: string; content: string }): Promise<IpcResponse<void>>;
  delete(input: { workspaceId: string }): Promise<IpcResponse<void>>;
}

export interface ElectronCookie {
  name: string;
  value: string;
  domain: string;
  hostOnly?: boolean;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  session: boolean;
  expirationDate?: number;
  sameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
}

export interface CookieSetData {
  url: string;
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expirationDate?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
}

export interface CookiesApi {
  getForUrl(url: string): Promise<IpcResponse<ElectronCookie[]>>;
  set(data: CookieSetData): Promise<IpcResponse<void>>;
  remove(url: string, name: string): Promise<IpcResponse<void>>;
  removeAllForDomain(domain: string): Promise<IpcResponse<{ removed: number }>>;
  clearAll(): Promise<IpcResponse<void>>;
  openPanel(params: { windowId: number; url: string; anchorRect: { right: number; bottom: number } }): Promise<IpcResponse<void>>;
  closePanel(params: { windowId: number }): Promise<IpcResponse<void>>;
}

export interface FavoritesApi {
  list(): Promise<IpcResponse<Favorite[]>>;
  add(input: { url: string; title: string; favicon?: string | null; parentId?: string | null; windowId?: number }): Promise<IpcResponse<Favorite>>;
  remove(input: { id: string }): Promise<IpcResponse<void>>;
  reorder(input: { id: string; newPosition: string }): Promise<IpcResponse<void>>;
  updateTitle(input: { id: string; title: string }): Promise<IpcResponse<void>>;
  createFolder(input: { title: string; parentId?: string | null }): Promise<IpcResponse<Favorite>>;
  move(input: { id: string; parentId: string | null; newPosition: string }): Promise<IpcResponse<void>>;
  update(input: { id: string; url?: string | null; title?: string; favicon?: string | null }): Promise<IpcResponse<void>>;
  exportFile(input: { data: string }): Promise<IpcResponse<void>>;
}

export interface AdBlockerApi {
  getStatus(input: { tabId: string }): Promise<IpcResponse<AdBlockerStatus>>;
  toggleSite(input: { domain: string }): Promise<IpcResponse<{ isException: boolean }>>;
  reloadTab(input: { tabId: string }): Promise<IpcResponse<void>>;
  listExceptions(): Promise<IpcResponse<string[]>>;
  removeException(input: { domain: string }): Promise<IpcResponse<void>>;
  updateLists(): Promise<IpcResponse<void>>;
  openPanel(input: { tabId: string; anchorRect: { right: number; bottom: number } }): Promise<IpcResponse<void>>;
  closePanel(input: { windowId: number }): Promise<IpcResponse<void>>;
}

export interface VaultSaveInput {
  domain: string;
  loginUrl: string;
  username: string;
  password: string;
  folder?: string;
  notes?: string;
}

export interface VaultApi {
  list(): Promise<IpcResponse<VaultEntrySummary[]>>;
  search(input: { query: string }): Promise<IpcResponse<VaultEntrySummary[]>>;
  getForDomain(input: { domain: string }): Promise<IpcResponse<VaultEntry[]>>;
  retrieve(input: { id: string }): Promise<IpcResponse<VaultEntry | null>>;
  save(input: VaultSaveInput): Promise<IpcResponse<VaultEntrySummary>>;
  update(input: { id: string; username?: string; password?: string; notes?: string; folder?: string; loginUrl?: string }): Promise<IpcResponse<VaultEntry>>;
  delete(input: { id: string }): Promise<IpcResponse<void>>;
  fill(input: { tabId: string; username: string; password: string }): Promise<IpcResponse<void>>;
  markUsed(input: { id: string }): Promise<IpcResponse<void>>;
  openSaveModal(input: { windowId: number; domain: string; loginUrl: string; username: string; password: string; hasExisting: boolean; existingId: string | null }): Promise<IpcResponse<void>>;
  closeSaveModal(input: { windowId: number }): Promise<IpcResponse<void>>;
  openAutofillModal(input: { windowId: number; tabId: string; domain: string; anchorRect: { right: number; bottom: number } }): Promise<IpcResponse<void>>;
  closeAutofillModal(input: { windowId: number }): Promise<IpcResponse<void>>;
  isUnlocked(): Promise<IpcResponse<{ unlocked: boolean }>>;
  listFolders(): Promise<IpcResponse<string[]>>;
  exportVault(input: { protectionPassword: string }): Promise<IpcResponse<void>>;
  importCsv(): Promise<IpcResponse<{ imported: number; skipped: number }>>;
  openPendingSaveModal(input: { windowId: number }): Promise<IpcResponse<void>>;
  openManager(input: { windowId: number }): Promise<IpcResponse<void>>;
  openAndFill(input: { windowId: number; loginUrl: string; username: string; password: string }): Promise<IpcResponse<void>>;
  countForDomain(input: { domain: string }): Promise<IpcResponse<{ count: number }>>;
}

export interface HistoryApi {
  search(input: { query: string; workspaceId?: string; limit?: number; offset?: number; from?: number; to?: number }): Promise<IpcResponse<HistorySearchEntry[]>>;
  getRecent(input: { limit?: number }): Promise<IpcResponse<HistorySearchEntry[]>>;
  getSessions(input: { workspaceId?: string }): Promise<IpcResponse<HistorySession[]>>;
  getDomainStats(input: { workspaceId?: string }): Promise<IpcResponse<DomainStat[]>>;
  delete(input: { id: string }): Promise<IpcResponse<void>>;
  deleteDomain(input: { domain: string }): Promise<IpcResponse<void>>;
  deleteAll(input: { workspaceId?: string }): Promise<IpcResponse<void>>;
  getForPeriod(input: { from: number; to: number; workspaceId?: string }): Promise<IpcResponse<HistorySearchEntry[]>>;
}

export interface FindApi {
  start(input: { text: string; matchCase?: boolean; windowId?: number }): Promise<IpcResponse<void>>;
  next(input?: { windowId?: number }): Promise<IpcResponse<void>>;
  prev(input?: { windowId?: number }): Promise<IpcResponse<void>>;
  stop(input?: { windowId?: number }): Promise<IpcResponse<void>>;
}

export interface FindBarApi {
  open(args: { windowId: number }): Promise<IpcResponse<void>>;
  close(args: { windowId: number }): Promise<IpcResponse<void>>;
}

export interface VelaInitState {
  /** Ancho del sidebar en px, leído síncronamente del perfil antes del primer render. */
  sidebarWidth: number;
}

export interface PreloadApi {
  /**
   * Información del frame: id de la BrowserWindow y perfil al que pertenece.
   * Estable durante toda la vida de la window (cambiar de perfil exige
   * abrir una nueva). Cada renderer la consume al arrancar para hidratar
   * los stores con datos del perfil correcto.
   */
  context(): Promise<IpcResponse<FrameContext>>;
  /** Plataforma del SO (win32, darwin, linux). Estático para toda la vida del proceso. */
  readonly platform: string;
  /** Estado inicial inyectado por el main antes del primer render. Síncrono, sin IPC. */
  readonly init: VelaInitState;
  workspaces: WorkspacesApi;
  profile: ProfileApi;
  node: NodeApi;
  tab: TabApi;
  tree: TreeApi;
  nav: NavApi;
  window: WindowApi;
  layout: LayoutApi;
  runtime: RuntimeApi;
  settings: SettingsApi;
  menu: MenuApi;
  rule: RuleApi;
  suggest: SuggestApi;
  update: UpdateApi;
  theme: ThemeApi;
  reader: ReaderApi;
  shortcuts: ShortcutsApi;
  devtools: DevtoolsApi;
  security: SecurityApi;
  devmode: DevModeApi;
  suggestionsPopup: SuggestionsPopupApi;
  searchEngines: SearchEnginesApi;
  commands: CommandsApi;
  mru: MruApi;
  extensions: ExtensionsApi;
  screenshot: ScreenshotApi;
  discard: DiscardApi;
  contextMenu: ContextMenuApi;
  filepicker: FilePickerApi;
  glance: GlanceApi;
  media: MediaApi;
  notes: NotesApi;
  history: HistoryApi;
  cookies: CookiesApi;
  favorites: FavoritesApi;
  adblocker: AdBlockerApi;
  vault: VaultApi;
  scripts: UserScriptsApi;
  bugSnapshot: BugSnapshotApi;
  resources: ResourcesApi;
  aparejos: AparejoApi;
  urlBarConfig: UrlBarConfigApi;
  titleBarConfig: TitleBarConfigApi;
  sync: SyncApi;
  recoveryCard: RecoveryCardApi;
  workspaceDrop: WorkspaceDropApi;
  profileDrop: ProfileDropApi;
  velaMenu: VelaMenuApi;
  addNodeMenu: AddNodeMenuApi;
  downloads: DownloadsApi;
  downloadPopup: DownloadPopupApi;
  tabPreview: TabPreviewApi;
  analyticsDebugger: AnalyticsDebuggerApi;
  cluster: ClusterApi;
  find: FindApi;
  findBar: FindBarApi;
  notifications: NotificationsApi;
  push: PushSubscriptionsApi;
  on<E extends keyof MainEventPayloads>(channel: E, handler: EventListener<E>): () => void;
  off<E extends keyof MainEventPayloads>(channel: E, handler: EventListener<E>): void;
}

export interface UserScriptsApi {
  list(): Promise<IpcResponse<UserScript[]>>;
  add(input: UserScriptData): Promise<IpcResponse<UserScript>>;
  update(input: { id: string; data: Partial<UserScriptData> }): Promise<IpcResponse<void>>;
  delete(input: { id: string }): Promise<IpcResponse<void>>;
  toggle(input: { id: string; enabled: boolean }): Promise<IpcResponse<void>>;
  test(input: { code: string; type: 'js' | 'css'; tabId?: string }): Promise<IpcResponse<void>>;
  importUrl(input: { url: string }): Promise<IpcResponse<UserScriptMeta>>;
}

export interface BugSnapshotApi {
  capture(input: { tabId: string; windowId: number }): Promise<IpcResponse<{ zipPath: string }>>;
  showInFolder(input: { zipPath: string }): Promise<IpcResponse<void>>;
  openFile(input: { zipPath: string }): Promise<IpcResponse<void>>;
}

export interface ResourcesApi {
  getAll(input: { profileId: string }): Promise<IpcResponse<TabResource[]>>;
}

export interface AparejoApi {
  getAll(): Promise<IpcResponse<AparejoStatus[]>>;
  set(input: { id: AparejoId; enabled: boolean }): Promise<IpcResponse<AparejoStatus[]>>;
}

export interface UrlBarConfigApi {
  getConfig(): Promise<IpcResponse<UrlBarIconConfig[]>>;
  setConfig(input: { config: UrlBarIconConfig[] }): Promise<IpcResponse<UrlBarIconConfig[]>>;
}

export interface TitleBarConfigApi {
  getConfig(): Promise<IpcResponse<TitleBarIconConfig[]>>;
  setConfig(input: { config: TitleBarIconConfig[] }): Promise<IpcResponse<TitleBarIconConfig[]>>;
}

export interface SyncApi {
  requestMagicLink(input: { email: string }): Promise<IpcResponse<void>>;
  setup(input: { token: string; syncPassword: string }): Promise<IpcResponse<SyncStatus>>;
  getStatus(): Promise<IpcResponse<SyncStatus>>;
  syncNow(): Promise<IpcResponse<void>>;
  getDevices(): Promise<IpcResponse<DeviceInfo[]>>;
  disconnectDevice(input: { tokenSuffix: string }): Promise<IpcResponse<void>>;
  deactivate(): Promise<IpcResponse<void>>;
  updateDeviceName(input: { name: string }): Promise<IpcResponse<void>>;
}

export interface RecoveryCardApi {
  downloadPdf(input: { email: string; date: string }): Promise<IpcResponse<{ filePath: string }>>;
}

export interface WorkspaceDropApi {
  open(input: { windowId: number; anchorRect: { left: number; bottom: number }; workspaceCount: number }): Promise<IpcResponse<void>>;
  close(input: { windowId: number }): Promise<IpcResponse<void>>;
  triggerModal(input: { windowId: number; mode: 'create' | 'manage' | 'edit'; editId?: string }): Promise<IpcResponse<void>>;
}

export interface ProfileDropApi {
  open(input: { windowId: number; anchorRect: { left: number; top: number }; profileCount: number }): Promise<IpcResponse<void>>;
  close(input: { windowId: number }): Promise<IpcResponse<void>>;
  triggerModal(input: { windowId: number; mode: 'create' | 'manage' | 'unlock'; profileId?: string }): Promise<IpcResponse<void>>;
}

export interface AddNodeMenuApi {
  open(input: { windowId: number; anchorRect: { left: number; bottom: number }; workspaceId: string; parentId: string | null }): Promise<IpcResponse<void>>;
  action(input: { windowId: number; action: 'new-tab' | 'new-folder' | 'new-secure-tab'; workspaceId: string; parentId: string | null }): Promise<IpcResponse<void>>;
}

export interface DownloadsApi {
  getAll(): Promise<IpcResponse<DownloadItem[]>>;
  pause(id: string): Promise<IpcResponse<void>>;
  resume(id: string): Promise<IpcResponse<void>>;
  cancel(id: string): Promise<IpcResponse<void>>;
  remove(id: string): Promise<IpcResponse<void>>;
  clearCompleted(): Promise<IpcResponse<void>>;
  showInFolder(savePath: string): Promise<IpcResponse<void>>;
  openFile(savePath: string): Promise<IpcResponse<void>>;
  openFolder(): Promise<IpcResponse<void>>;
}

export interface TabPreviewApi {
  show(input: { windowId: number; tabId: string; profileId: string; title: string; url: string; anchorRect: { right: number; top: number; bottom: number } }): Promise<void>;
  update(input: { windowId: number; tabId: string; profileId: string; title: string; url: string }): Promise<void>;
  hide(input: { windowId: number }): Promise<void>;
}

export interface DownloadPopupApi {
  open(args: { windowId: number; anchorRect: { left: number; bottom: number } }): Promise<void>;
  close(args: { windowId: number }): Promise<void>;
}

export interface AnalyticsDebuggerApi {
  open(): Promise<IpcResponse<void>>;
  close(): Promise<IpcResponse<void>>;
  clear(): Promise<IpcResponse<void>>;
  getEvents(): Promise<IpcResponse<import('./types/analyticsDebugger').AnalyticsHit[]>>;
}

export interface ToolsClusterState {
  isInReaderMode: boolean;
  isReadable: boolean;
  devtoolsActive: boolean;
  isAnchored: boolean;
  anchoredTabId: string | null;
  isSecureTab: boolean;
  isFavorite: boolean;
  favoriteId: string | null;
  activeTabId: string | null;
  currentUrl: string;
  pageTitle?: string;
  favicon?: string | null;
  visibleIcons?: Record<string, boolean>;
}

export interface StatusClusterState {
  notifPermission?: string;
  pageFeatures: string[];
  activeTabId: string | null;
  currentUrl: string;
  visibleIcons?: Record<string, boolean>;
}

export interface ClusterApi {
  openTools(input: { windowId: number; anchorRect: { right: number; bottom: number }; state: ToolsClusterState }): Promise<IpcResponse<void>>;
  closeTools(input: { windowId: number }): Promise<IpcResponse<void>>;
  openStatus(input: { windowId: number; anchorRect: { right: number; bottom: number }; state: StatusClusterState }): Promise<IpcResponse<void>>;
  closeStatus(input: { windowId: number }): Promise<IpcResponse<void>>;
  relayAction(input: { windowId: number; action: string; clusterType: 'tools' | 'status'; payload?: Record<string, unknown> }): Promise<IpcResponse<void>>;
}

export interface StoredNotificationItem {
  id: string;
  origin: string;
  title: string;
  body: string;
  icon: string | null;
  timestamp: number;
  read: boolean;
  tabId: string | null;
  source: 'web' | 'push';
}

export interface NotificationPermissionItem {
  origin: string;
  state: 'granted' | 'denied';
  grantedAt?: number;
  deniedAt?: number;
}

export interface PushSubscriptionItem {
  id: string;
  origin: string;
  endpoint: string;
  createdAt: number;
  lastPushAt: number | null;
}

export interface NotificationsApi {
  getAll(): Promise<IpcResponse<StoredNotificationItem[]>>;
  getUnreadCount(): Promise<IpcResponse<number>>;
  markRead(input: { id: string }): Promise<IpcResponse<void>>;
  markAllRead(): Promise<IpcResponse<void>>;
  delete(input: { id: string }): Promise<IpcResponse<void>>;
  clearAll(): Promise<IpcResponse<void>>;
  grantPermission(input: { origin: string; withPush?: boolean }): Promise<IpcResponse<void>>;
  denyPermission(input: { origin: string }): Promise<IpcResponse<void>>;
  getPermission(input: { origin: string }): Promise<IpcResponse<string>>;
  getAllPermissions(): Promise<IpcResponse<NotificationPermissionItem[]>>;
  revokePermission(input: { origin: string }): Promise<IpcResponse<void>>;
  getSilenceRules(): Promise<IpcResponse<unknown[]>>;
  setSilenceRules(input: { rules: unknown[] }): Promise<IpcResponse<void>>;
  openPermissionPopup(input: { windowId: number; origin: string; hasPushRequest: boolean; anchorRect: { left: number; bottom: number } }): Promise<IpcResponse<void>>;
  closePermissionPopup(input: { windowId: number }): Promise<IpcResponse<void>>;
  openCenter(): Promise<IpcResponse<void>>;
}

export interface PushSubscriptionsApi {
  list(): Promise<IpcResponse<PushSubscriptionItem[]>>;
  unsubscribe(input: { origin: string }): Promise<IpcResponse<void>>;
  unsubscribeAll(): Promise<IpcResponse<void>>;
  getSubscription(input: { origin: string }): Promise<IpcResponse<PushSubscriptionItem | null>>;
}

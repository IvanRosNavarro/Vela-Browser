export interface ContextMenuLinkData {
  url: string;
  text?: string;
  profiles: Array<{ id: string; name: string }>;
}

export interface ContextMenuImageData {
  url: string;
}

export interface ContextMenuSelectionData {
  text: string;
  searchLabel: string;
  searchUrl: string;
}

export interface ContextMenuEditFlags {
  canCut: boolean;
  canCopy: boolean;
  canPaste: boolean;
  canSelectAll: boolean;
}

export interface ContextMenuShowPayload {
  windowId: number;
  /** Posición dentro del renderer (sidebarWidth + wcvX, addressBarHeight + wcvY). */
  x: number;
  y: number;
  /** Posición original en el WCV (para copyImageAt, inspectElement). */
  wcvX: number;
  wcvY: number;
  canGoBack: boolean;
  canGoForward: boolean;
  activeTabId: string | null;
  link: ContextMenuLinkData | null;
  image: ContextMenuImageData | null;
  selection: ContextMenuSelectionData | null;
  isEditable: boolean;
  editFlags: ContextMenuEditFlags;
  currentUrl: string | null;
  currentTitle: string | null;
}

export type ContextMenuExecAction =
  | { type: 'image:copy'; wcvX: number; wcvY: number }
  | { type: 'image:save'; url: string }
  | { type: 'page:save' }
  | { type: 'page:print' }
  | { type: 'devtools:inspect'; wcvX: number; wcvY: number }
  | { type: 'link:open-window'; url: string }
  | { type: 'link:open-profile'; url: string; profileId: string };

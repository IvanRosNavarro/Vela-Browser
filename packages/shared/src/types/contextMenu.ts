export interface ContextMenuLinkData {
  url: string;
  text?: string;
  profiles: Array<{ id: string; name: string }>;
  /** Workspaces del perfil actual distintos del que muestra la ventana. */
  workspaces: Array<{ id: string; name: string }>;
}

export interface ContextMenuImageData {
  url: string;
}

/** Clic derecho sobre un `<video>` que admite imagen en imagen. */
export interface ContextMenuVideoData {
  /** El vídeo ya está en imagen en imagen (el ítem pasa a "salir"). */
  inPip: boolean;
  /** Frame que contiene el vídeo (`webFrameMain.fromFrameToken`). */
  frameProcessId: number;
  frameToken: string;
}

export interface ContextMenuSelectionData {
  text: string;
  searchLabel: string;
  searchUrl: string;
}

/**
 * Palabra mal escrita bajo el cursor. Solo llega cuando el corrector del
 * perfil está activo y el clic cae sobre una palabra subrayada de un campo
 * editable.
 */
export interface ContextMenuSpellingData {
  misspelledWord: string;
  /** Sugerencias del diccionario; puede venir vacío. */
  suggestions: string[];
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
  video: ContextMenuVideoData | null;
  selection: ContextMenuSelectionData | null;
  spelling: ContextMenuSpellingData | null;
  isEditable: boolean;
  editFlags: ContextMenuEditFlags;
  currentUrl: string | null;
  currentTitle: string | null;
  /**
   * Modo oscuro de las webs en el sitio de la página: `active` es lo que ve
   * el usuario ahora. Ausente o null si la página no lo admite (vela://…).
   */
  darkMode?: { active: boolean } | null;
}

export type ContextMenuExecAction =
  | { type: 'image:copy'; wcvX: number; wcvY: number }
  | { type: 'image:save'; url: string }
  | { type: 'page:save' }
  | { type: 'page:print' }
  | { type: 'devtools:inspect'; wcvX: number; wcvY: number }
  | { type: 'link:open-window'; url: string }
  | { type: 'link:open-profile'; url: string; profileId: string }
  | { type: 'link:open-workspace'; url: string; workspaceId: string };

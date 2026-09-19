/** Árbol de marcadores leído de otro navegador, ya independiente de su formato. */
export interface ImportedBookmark {
  kind: 'bookmark';
  title: string;
  url: string;
}

export interface ImportedFolder {
  kind: 'folder';
  title: string;
  children: ImportedNode[];
}

export type ImportedNode = ImportedBookmark | ImportedFolder;

/** Una visita del historial, con la fecha ya en milisegundos Unix. */
export interface ImportedVisit {
  url: string;
  title: string;
  visitedAt: number;
}

export interface HistoryReadOptions {
  /** Visitas anteriores a esta fecha (ms Unix) se ignoran. */
  since: number;
  /** Máximo de visitas leídas, de la más reciente hacia atrás. */
  limit: number;
}

/** Nombres de las carpetas raíz, iguales para Chromium y Firefox. */
export const ROOT_FOLDER_TITLES = {
  toolbar: 'Barra de marcadores',
  menu: 'Menú de marcadores',
  other: 'Otros marcadores',
  mobile: 'Marcadores del móvil',
} as const;

/** Profundidad máxima que se recorre: defensa ante ficheros corruptos o cíclicos. */
export const MAX_DEPTH = 64;

/** El historial solo trae páginas web: el resto de esquemas no se puede reabrir. */
export function isImportableHistoryUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

export type CollectionViewMode = 'grid' | 'list';

/**
 * Elemento que muestra la vista de colección. Cada página (Favoritos,
 * Carpeta) traduce sus datos a esta forma y decide qué hacer con las acciones.
 */
export interface CollectionItem {
  id: string;
  kind: 'link' | 'folder';
  /** Nombre visible. */
  title: string;
  /** Valor inicial del campo nombre al editar (puede diferir del visible). */
  editableTitle: string;
  url?: string | null;
  favicon?: string | null;
  /** Emoji de la carpeta, si tiene. */
  icon?: string | null;
  /** Color de la carpeta, si tiene. */
  color?: string | null;
  /** Texto secundario extra (p. ej. la carpeta donde está, al buscar). */
  hint?: string | null;
}

export interface CollectionEditResult {
  /** `null` = nombre vacío (solo si la página lo admite). */
  title: string | null;
  /** Solo presente si la página permite editar la dirección. */
  url?: string;
}

export interface BreadcrumbEntry {
  id: string | null;
  label: string;
}

/** Reordenación y paso a carpeta por arrastre. Opcional. */
export interface CollectionDnd {
  /** Queda entre `prevId` y `nextId` (null = extremo) dentro de la vista actual. */
  onReorder: (draggedId: string, prevId: string | null, nextId: string | null) => void;
  onDropIntoFolder: (draggedId: string, folderId: string) => void;
}

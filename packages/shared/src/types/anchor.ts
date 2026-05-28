/** Ancla: pestaña pinned de scope perfil (independiente de workspace). */
export interface Anchor {
  id: string;
  /** URL de navegación actual (se actualiza cuando el WCV navega). */
  url: string;
  /** URL canónica con la que fue creada el Ancla; usada para "Restaurar Ancla". */
  anchorUrl: string;
  title: string;
  favicon: string | null;
  position: string;
  createdAt: number;
}

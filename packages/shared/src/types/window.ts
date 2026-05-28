// Una ventana = un perfil estable durante toda su vida (Fase 3 ADR).
// Cambiar el perfil de una ventana ya abierta requiere cerrarla y abrir
// otra. switchWindowProfile en runtime queda para Fase 4.
export interface WindowState {
  windowId: number;
  profileId: string;
  activeWorkspaceId: string;
  // Bounds y otros se gestionan en otro lado.
}

/** Descripción pública de una ventana abierta (para el renderer). */
export interface WindowInfo {
  windowId: string;
  profileId: string;
  workspaceId: string | null;
  workspaceName: string | null;
  isPrimary: boolean;
}

export interface SyncStatus {
  configured: boolean;
  connected: boolean;
  lastSyncAt: number | null;
  syncInProgress: boolean;
  /** Token del magic link recibido vía vela://sync-callback, pendiente de confirmar con contraseña. */
  pendingCallbackToken?: string | null;
}

export interface DeviceInfo {
  tokenSuffix: string;
  userAgent: string;
  lastSeenAt: number;
  isCurrent: boolean;
}

/**
 * Perfil ya existente en el servidor de sync. Se ofrece al vincular un
 * dispositivo nuevo: elegir el perfil correcto es lo que hace que los datos
 * de ambos equipos converjan (el servidor particiona todo por este id).
 */
export interface RemoteSyncProfile {
  id: string;
  /** Nombre descifrado, o null si la contraseña de sync no lo abre. */
  name: string | null;
  /** Equipo donde se creó el perfil, si se conoce. */
  host: string | null;
  updatedAt: number;
}

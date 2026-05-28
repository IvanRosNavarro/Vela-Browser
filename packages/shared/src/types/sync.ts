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

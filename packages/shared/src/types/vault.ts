export interface VaultEntrySummary {
  id: string;
  domain: string;
  loginUrl: string | null;
  username: string;
  folder: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

export interface VaultEntry extends VaultEntrySummary {
  password: string;
  notes: string | null;
}

export interface VaultCredentialsPending {
  windowId: number;
  tabId: string;
  domain: string;
  loginUrl: string;
  username: string;
  password: string;
  hasExisting: boolean;
  existingId: string | null;
}

/**
 * Resumen (sin contraseña) de las credenciales detectadas y pendientes de que
 * el usuario decida si quiere guardarlas. El renderer lo consulta al cambiar de
 * URL para recuperar el estado "pendiente" del icono de llave: el evento push
 * llega durante la navegación post-login y se perdería si el botón dependiera
 * solo de él.
 */
export interface VaultPendingInfo {
  tabId: string;
  domain: string;
  loginUrl: string;
  username: string;
  hasExisting: boolean;
  existingId: string | null;
}

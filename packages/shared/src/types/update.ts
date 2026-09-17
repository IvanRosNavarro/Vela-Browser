/**
 * Estado del actualizador. Lo mantiene `UpdateService` en main y lo emite
 * completo en cada cambio (`state:update-status-changed`): el renderer nunca
 * reconstruye el estado a partir de eventos sueltos.
 *
 * - `unsupported`: build sin empaquetar (desarrollo). No hay feed que consultar.
 */
export type UpdatePhase =
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateStatus {
  phase: UpdatePhase;
  /** Versión instalada ahora mismo. */
  currentVersion: string;
  /** Versión nueva cuando la hay. */
  version: string | null;
  /** 0-100 durante la descarga. */
  percent: number;
  error: string | null;
  checkedAt: number | null;
  /**
   * false cuando la plataforma no puede instalar sola (macOS sin firmar:
   * Squirrel.Mac exige binario firmado). En ese caso la interfaz ofrece abrir
   * la página de la release para descargarla a mano.
   */
  canInstall: boolean;
}

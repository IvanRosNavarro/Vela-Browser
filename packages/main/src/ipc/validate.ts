import { app, type IpcMainInvokeEvent, type IpcMainEvent } from 'electron';
import { createFrameGuard } from 'vela-kit/ipc';
import { logger } from '../logger';
import { TRUSTED_FRAME_PREFIXES, originOf } from './trustedFrameUrl';

const DEV_SERVER_ORIGIN = app.isPackaged
  ? null
  : originOf(process.env['VITE_DEV_SERVER_URL'] ?? 'http://localhost:5173');

// La lógica del guard vive en vela-kit (ADR 0106). Este módulo es la fachada
// que importan los handlers IPC.
const frameGuard = createFrameGuard({
  trustedPrefixes: TRUSTED_FRAME_PREFIXES,
  devServerOrigin: DEV_SERVER_ORIGIN,
  logger,
});

/**
 * Devuelve true si el frame remitente es de confianza: una página interna
 * vela://, el renderer empaquetado (file://) o el dev server.
 */
export function isTrustedFrame(
  event: IpcMainInvokeEvent | IpcMainEvent,
): boolean {
  return frameGuard.isTrustedFrame(event);
}

/**
 * Lanza `UntrustedFrameError` si el frame remitente no es de confianza y
 * registra el intento. Llamar al inicio de cualquier handler IPC que no deba
 * recibir mensajes de WebContentsViews externos (pestañas web, iframes,
 * extensiones).
 */
export function guardTrustedFrame(
  event: IpcMainInvokeEvent | IpcMainEvent,
  channel: string,
): void {
  frameGuard.guardTrustedFrame(event, channel);
}

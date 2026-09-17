import { app, type IpcMainInvokeEvent, type IpcMainEvent } from 'electron';
import { logger } from '../logger';
import { isTrustedFrameUrl, originOf } from './trustedFrameUrl';

const DEV_SERVER_ORIGIN = app.isPackaged
  ? null
  : originOf(process.env['VITE_DEV_SERVER_URL'] ?? 'http://localhost:5173');

/**
 * Devuelve true si el frame remitente es de confianza: una página interna
 * vela://, el renderer empaquetado (file://) o el dev server.
 */
export function isTrustedFrame(
  event: IpcMainInvokeEvent | IpcMainEvent,
): boolean {
  return isTrustedFrameUrl(event.senderFrame?.url ?? '', DEV_SERVER_ORIGIN);
}

/**
 * Lanza si el frame remitente no es de confianza y registra el intento.
 * Llamar al inicio de cualquier handler IPC que no deba recibir mensajes
 * de WebContentsViews externos (pestañas web, iframes, extensiones).
 */
export function guardTrustedFrame(
  event: IpcMainInvokeEvent | IpcMainEvent,
  channel: string,
): void {
  if (!isTrustedFrame(event)) {
    const senderUrl = event.senderFrame?.url ?? '';
    logger.warn('[IPC Security] Blocked call from untrusted frame', {
      channel,
      senderUrl,
      timestamp: Date.now(),
    });
    throw new Error(`IPC call from untrusted frame: ${senderUrl}`);
  }
}

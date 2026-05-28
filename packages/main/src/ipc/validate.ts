import { app, type IpcMainInvokeEvent, type IpcMainEvent } from 'electron';
import { logger } from '../logger';

const isDev = !app.isPackaged;

/**
 * Devuelve true si el frame remitente es de confianza: una página interna
 * vela://, el renderer empaquetado (file://) o el dev server (localhost).
 */
export function isTrustedFrame(
  event: IpcMainInvokeEvent | IpcMainEvent,
): boolean {
  const url = event.senderFrame?.url ?? '';
  return (
    url.startsWith('vela://') ||
    url.startsWith('file://') ||
    (isDev && url.startsWith('http://localhost'))
  );
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

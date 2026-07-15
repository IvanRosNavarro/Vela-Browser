import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  IPC_CHANNELS,
  type ClientCertificateInfo,
  type ClientCertRememberedChoice,
  type IpcResponse,
} from '@vela/shared';
import type { IpcContext } from './context';
import { guardTrustedFrame } from './validate';
import { getFrameContext } from './helpers';
import { mapError } from './errors';

/** Canales invocados solo desde vela://client-cert-select. Igual que
 *  cert:allow/cert:go-back en cert.ts, se restringen al origen exacto del
 *  popup (no basta con guardTrustedFrame, que acepta cualquier vela://)
 *  porque resuelven una decisión de seguridad pendiente. */
function guardPopupFrame(event: IpcMainInvokeEvent, channel: string): void {
  guardTrustedFrame(event, channel);
  const senderUrl = event.sender.getURL();
  if (!senderUrl.startsWith('vela://client-cert-select')) {
    throw new Error(`IPC call from unexpected frame for ${channel}: ${senderUrl}`);
  }
}

export function registerClientCertHandlers(ctx: IpcContext): void {
  const cm = ctx.clientCertManager;

  // ── client-cert:get-initial-data ──────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.CLIENT_CERT_GET_INITIAL_DATA,
    (event, payload): { hostname: string; certificates: ClientCertificateInfo[] } | null => {
      guardPopupFrame(event, IPC_CHANNELS.CLIENT_CERT_GET_INITIAL_DATA);
      const { wcId } = payload as { wcId: number };
      return cm.getInitialData(wcId);
    },
  );

  // ── client-cert:select ────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.CLIENT_CERT_SELECT,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardPopupFrame(event, IPC_CHANNELS.CLIENT_CERT_SELECT);
        const { wcId, fingerprint, remember } = payload as { wcId: number; fingerprint: string; remember: boolean };
        cm.select(wcId, fingerprint, remember);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.CLIENT_CERT_SELECT);
      }
    },
  );

  // ── client-cert:cancel ─────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.CLIENT_CERT_CANCEL,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardPopupFrame(event, IPC_CHANNELS.CLIENT_CERT_CANCEL);
        const { wcId } = payload as { wcId: number };
        cm.cancel(wcId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.CLIENT_CERT_CANCEL);
      }
    },
  );

  // ── client-cert:get-all (Ajustes → Privacidad) ────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.CLIENT_CERT_GET_ALL,
    async (event): Promise<IpcResponse<ClientCertRememberedChoice[]>> => {
      try {
        const { profileId } = getFrameContext(event, ctx);
        return { ok: true, data: cm.getRemembered(profileId) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.CLIENT_CERT_GET_ALL);
      }
    },
  );

  // ── client-cert:forget (Ajustes → Privacidad) ─────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.CLIENT_CERT_FORGET,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { profileId } = getFrameContext(event, ctx);
        const { origin } = payload as { origin: string };
        cm.forget(origin, profileId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.CLIENT_CERT_FORGET);
      }
    },
  );
}

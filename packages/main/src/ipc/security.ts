import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS, z, type IpcResponse, type CertificateInfo } from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';

const getCertificateSchema = z.object({
  windowId: z.number().int().optional(),
});

function resolveWindowId(event: IpcMainInvokeEvent): number | null {
  const win =
    BrowserWindow.fromWebContents(event.sender) ??
    (event.sender as typeof event.sender & { getOwnerBrowserWindow?(): BrowserWindow | null }).getOwnerBrowserWindow?.() ??
    null;
  return win?.id ?? null;
}

export function registerSecurityHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.SECURITY_GET_CERTIFICATE,
    async (event, payload): Promise<IpcResponse<CertificateInfo | null>> => {
      guardTrustedFrame(event, IPC_CHANNELS.SECURITY_GET_CERTIFICATE);
      const parsed = getCertificateSchema.safeParse(payload ?? {});
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const windowId = parsed.data.windowId ?? resolveWindowId(event);
        if (windowId === null) return { ok: true, data: null };

        const cert = ctx.tabManager.getCertificateForWindow(windowId);
        return { ok: true, data: cert };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SECURITY_GET_CERTIFICATE);
      }
    },
  );
}

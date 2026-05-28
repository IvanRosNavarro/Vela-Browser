import { ipcMain, app, shell, BrowserWindow } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { IPC_CHANNELS, IPC_EVENTS, z, type IpcResponse } from '@vela/shared';
import type { SyncStatus, DeviceInfo } from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getFrameContext } from './helpers';
import { SyncManager } from '../sync/SyncManager';
import { syncEvents } from '../sync/syncEvents';

const SERVER_URL = 'https://sync.vela-browser.com';

// Token del magic link recibido vía vela://sync-callback. Persiste en memoria
// para que getStatus() lo devuelva incluso tras un reload del renderer.
let pendingCallbackToken: string | null = null;

const updateDeviceNameSchema = z.object({ name: z.string().min(1).max(100) });
const recoveryCardPdfSchema = z.object({ email: z.string(), date: z.string() });

const requestMagicLinkSchema = z.object({ email: z.string().email() });
const setupSchema = z.object({
  token: z.string().min(1),
  syncPassword: z.string().min(1),
});
const disconnectDeviceSchema = z.object({ tokenSuffix: z.string().min(1) });

function getOrCreateSyncManager(profileId: string, ctx: IpcContext): SyncManager {
  if (!ctx.syncManagers.has(profileId)) {
    const manager = new SyncManager(
      profileId,
      () => ctx.profileManager.getRepositories(profileId),
      ctx.logger,
      ctx.events,
      (pid, origin, payloadBase64) => {
        const plaintext = ctx.pushProxyManager.decryptPayload(pid, origin, payloadBase64);
        if (!plaintext) return;
        let title = 'Notificación push';
        let body = plaintext;
        let icon: string | undefined;
        try {
          const parsed = JSON.parse(plaintext) as {
            title?: string;
            body?: string;
            icon?: string;
            url?: string;
          };
          title = parsed.title ?? title;
          body = parsed.body ?? '';
          icon = parsed.icon;
        } catch { /* plaintext is not JSON — use as body */ }

        ctx.notificationManager.receive({
          origin,
          title,
          body,
          icon,
          source: 'push',
          profileId: pid,
        });
      },
    );
    ctx.syncManagers.set(profileId, manager);
  }
  return ctx.syncManagers.get(profileId)!;
}

export function registerSyncHandlers(ctx: IpcContext): void {

  // Cuando el protocolo vela:// recibe vela://sync-callback?token=X, reenviar
  // el token al renderer para que la UI de settings avance al siguiente paso.
  syncEvents.on('callback:sync', ({ token }: { token: string }) => {
    pendingCallbackToken = token;
    ctx.events.emit(IPC_EVENTS.SYNC_CALLBACK_RECEIVED, { token });
  });

  // Al abrir un perfil, intentar restaurar la sesión de sync desde el keychain
  // del SO (token + clave cifrada con safeStorage). Si no hay credenciales
  // guardadas el manager queda en estado unconfigured y sigue el flujo normal.
  ctx.events.on(IPC_EVENTS.PROFILE_UNLOCKED, ({ profileId }) => {
    const manager = getOrCreateSyncManager(profileId, ctx);
    if (manager.isConfigured()) return;
    void manager.restoreFromStorage().then((restored) => {
      if (restored) ctx.logger.info(`[sync] sesión restaurada para perfil ${profileId}`);
    });
  });

  ipcMain.handle(
    IPC_CHANNELS.SYNC_REQUEST_MAGIC_LINK,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { email } = requestMagicLinkSchema.parse(payload);

        const res = await fetch(`${SERVER_URL}/auth/magic-link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });

        if (!res.ok) {
          return { ok: false, error: 'INTERNAL', details: `Status ${res.status}` };
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_REQUEST_MAGIC_LINK);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SYNC_SETUP,
    async (event, payload): Promise<IpcResponse<SyncStatus>> => {
      try {
        const { token, syncPassword } = setupSchema.parse(payload);
        const { profileId } = getFrameContext(event, ctx);

        const manager = getOrCreateSyncManager(profileId, ctx);
        await manager.configure(token, syncPassword);
        pendingCallbackToken = null;

        return { ok: true, data: manager.getStatus() };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_SETUP);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SYNC_GET_STATUS,
    async (event): Promise<IpcResponse<SyncStatus>> => {
      try {
        const { profileId } = getFrameContext(event, ctx);
        const manager = ctx.syncManagers.get(profileId);
        const status: SyncStatus = manager?.getStatus() ?? {
          configured: false,
          connected: false,
          lastSyncAt: null,
          syncInProgress: false,
        };
        if (pendingCallbackToken) {
          status.pendingCallbackToken = pendingCallbackToken;
        }
        return { ok: true, data: status };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_GET_STATUS);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SYNC_NOW,
    async (event): Promise<IpcResponse<void>> => {
      try {
        const { profileId } = getFrameContext(event, ctx);
        const manager = ctx.syncManagers.get(profileId);
        if (manager?.isConfigured()) {
          await manager.pullChanges();
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_NOW);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SYNC_GET_DEVICES,
    async (event): Promise<IpcResponse<DeviceInfo[]>> => {
      try {
        const { profileId } = getFrameContext(event, ctx);
        const manager = ctx.syncManagers.get(profileId);
        const devices = (await manager?.getDevices()) ?? [];
        return { ok: true, data: devices as DeviceInfo[] };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_GET_DEVICES);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SYNC_DISCONNECT_DEVICE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { tokenSuffix } = disconnectDeviceSchema.parse(payload);
        const { profileId } = getFrameContext(event, ctx);
        const manager = ctx.syncManagers.get(profileId);
        await manager?.disconnectDevice(tokenSuffix);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_DISCONNECT_DEVICE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SYNC_DEACTIVATE,
    async (event): Promise<IpcResponse<void>> => {
      try {
        const { profileId } = getFrameContext(event, ctx);
        const manager = ctx.syncManagers.get(profileId);
        if (manager) {
          await manager.deactivate();
          manager.destroy();
          ctx.syncManagers.delete(profileId);
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_DEACTIVATE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SYNC_UPDATE_DEVICE_NAME,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { name } = updateDeviceNameSchema.parse(payload);
        const { profileId } = getFrameContext(event, ctx);
        const manager = ctx.syncManagers.get(profileId);
        if (manager?.isConfigured()) {
          await fetch(`${SERVER_URL}/sync/device-name`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SYNC_UPDATE_DEVICE_NAME);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RECOVERY_CARD_DOWNLOAD_PDF,
    async (event, payload): Promise<IpcResponse<{ filePath: string }>> => {
      try {
        const { email, date } = recoveryCardPdfSchema.parse(payload);
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) {
          return { ok: false, error: 'INTERNAL', details: 'No window found' };
        }

        const data = await win.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: { marginType: 'default' },
        });

        const downloadsDir = app.getPath('downloads');
        const fileName = `vela-recovery-card-${date.replace(/\s/g, '-')}.pdf`;
        const filePath = path.join(downloadsDir, fileName);
        fs.writeFileSync(filePath, data);
        await shell.openPath(filePath);

        return { ok: true, data: { filePath } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.RECOVERY_CARD_DOWNLOAD_PDF);
      }
    },
  );
}

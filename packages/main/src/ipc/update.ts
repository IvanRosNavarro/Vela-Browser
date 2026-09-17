import { app, ipcMain, session, BrowserWindow } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type IpcResponse,
  type UpdateStatus,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';
import { getUpdateService } from '../updater';
import { resolveWindowId } from './helpers';
import { InvariantViolationError } from '../lib/errors';

function broadcastToAllWindows(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

/**
 * Estado de reserva si alguien pregunta antes de que `initUpdater` corra: el
 * renderer siempre recibe un `UpdateStatus` completo, nunca `null`.
 */
function fallbackStatus(): UpdateStatus {
  return {
    phase: 'unsupported',
    currentVersion: app.getVersion(),
    version: null,
    percent: 0,
    error: null,
    checkedAt: null,
    canInstall: false,
  };
}

export function registerUpdateHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.UPDATE_GET_STATUS,
    async (event): Promise<IpcResponse<UpdateStatus>> => {
      guardTrustedFrame(event, IPC_CHANNELS.UPDATE_GET_STATUS);
      return { ok: true, data: getUpdateService()?.current ?? fallbackStatus() };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_CHECK_NOW,
    async (event): Promise<IpcResponse<UpdateStatus>> => {
      guardTrustedFrame(event, IPC_CHANNELS.UPDATE_CHECK_NOW);
      // La comprobación puede pedirse desde vela://settings o desde el menú de
      // Vela, que son ventanas distintas de la shell: el aviso abre la modal
      // allí donde vive la interfaz.
      broadcastToAllWindows(IPC_EVENTS.UPDATE_MODAL_OPEN);
      try {
        const service = getUpdateService();
        return { ok: true, data: service ? await service.check() : fallbackStatus() };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.UPDATE_CHECK_NOW);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_DOWNLOAD,
    async (event): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.UPDATE_DOWNLOAD);
      try {
        // No se espera: el progreso viaja por `state:update-status-changed`.
        void getUpdateService()?.download();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.UPDATE_DOWNLOAD);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_QUIT_AND_INSTALL,
    async (event): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.UPDATE_QUIT_AND_INSTALL);
      try {
        getUpdateService()?.install();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.UPDATE_QUIT_AND_INSTALL);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_OPEN_RELEASE,
    async (event): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.UPDATE_OPEN_RELEASE);
      try {
        getUpdateService()?.openRelease();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.UPDATE_OPEN_RELEASE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.PROFILE_CLEAR_DATA,
    async (event): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.PROFILE_CLEAR_DATA);
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError(
            'profile:clear-data: webContents sin BrowserWindow asociada',
          );
        }
        const profileId = ctx.profileWindowManager.getProfileForWindow(windowId);
        if (!profileId) {
          throw new InvariantViolationError(
            `profile:clear-data: window ${windowId} sin perfil asignado`,
          );
        }
        const ses = session.fromPartition(`persist:profile-${profileId}`);
        await ses.clearCache();
        await ses.clearStorageData({
          storages: ['cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage'],
        });
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_CLEAR_DATA);
      }
    },
  );
}

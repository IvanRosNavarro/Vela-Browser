import { ipcMain, session } from 'electron';
import { IPC_CHANNELS, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';
import { checkForUpdatesNow, downloadUpdate, quitAndInstall } from '../updater';
import { resolveWindowId } from './helpers';
import { InvariantViolationError } from '../lib/errors';

export function registerUpdateHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.UPDATE_CHECK_NOW,
    async (): Promise<IpcResponse<void>> => {
      try {
        await checkForUpdatesNow();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.UPDATE_CHECK_NOW);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_DOWNLOAD,
    async (): Promise<IpcResponse<void>> => {
      try {
        await downloadUpdate();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.UPDATE_DOWNLOAD);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.UPDATE_QUIT_AND_INSTALL,
    async (): Promise<IpcResponse<void>> => {
      try {
        quitAndInstall();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.UPDATE_QUIT_AND_INSTALL);
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

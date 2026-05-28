import { app, ipcMain, shell } from 'electron';
import { IPC_CHANNELS, z, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import type { DownloadItem } from '@vela/shared';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';

const idSchema = z.object({ id: z.string().uuid() });
const pathSchema = z.object({ savePath: z.string().min(1) });

export function registerDownloadHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.DOWNLOADS_GET_ALL,
    async (event): Promise<IpcResponse<DownloadItem[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DOWNLOADS_GET_ALL);
        return { ok: true, data: ctx.downloadManager.getAll() };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DOWNLOADS_GET_ALL);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DOWNLOADS_PAUSE,
    async (event, rawArgs): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DOWNLOADS_PAUSE);
        const parsed = idSchema.safeParse(rawArgs);
        if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
        ctx.downloadManager.pause(parsed.data.id);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DOWNLOADS_PAUSE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DOWNLOADS_RESUME,
    async (event, rawArgs): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DOWNLOADS_RESUME);
        const parsed = idSchema.safeParse(rawArgs);
        if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
        ctx.downloadManager.resume(parsed.data.id);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DOWNLOADS_RESUME);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DOWNLOADS_CANCEL,
    async (event, rawArgs): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DOWNLOADS_CANCEL);
        const parsed = idSchema.safeParse(rawArgs);
        if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
        ctx.downloadManager.cancel(parsed.data.id);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DOWNLOADS_CANCEL);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DOWNLOADS_REMOVE,
    async (event, rawArgs): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DOWNLOADS_REMOVE);
        const parsed = idSchema.safeParse(rawArgs);
        if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
        ctx.downloadManager.remove(parsed.data.id);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DOWNLOADS_REMOVE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DOWNLOADS_CLEAR_COMPLETED,
    async (event): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DOWNLOADS_CLEAR_COMPLETED);
        ctx.downloadManager.clearCompleted();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DOWNLOADS_CLEAR_COMPLETED);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DOWNLOADS_SHOW_IN_FOLDER,
    async (event, rawArgs): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DOWNLOADS_SHOW_IN_FOLDER);
        const parsed = pathSchema.safeParse(rawArgs);
        if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
        shell.showItemInFolder(parsed.data.savePath);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DOWNLOADS_SHOW_IN_FOLDER);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DOWNLOADS_OPEN_FILE,
    async (event, rawArgs): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DOWNLOADS_OPEN_FILE);
        const parsed = pathSchema.safeParse(rawArgs);
        if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
        await shell.openPath(parsed.data.savePath);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DOWNLOADS_OPEN_FILE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DOWNLOADS_OPEN_FOLDER,
    async (event): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DOWNLOADS_OPEN_FOLDER);
        await shell.openPath(app.getPath('downloads'));
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DOWNLOADS_OPEN_FOLDER);
      }
    },
  );
}

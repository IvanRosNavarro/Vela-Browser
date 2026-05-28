import { ipcMain, shell, BrowserWindow } from 'electron';
import { z, IPC_CHANNELS, IPC_EVENTS, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { guardTrustedFrame } from './validate';
import { getFrameContext } from './helpers';
import { mapError } from './errors';
import { BugSnapshotService, initConsoleBuffers } from '../devtools/BugSnapshotService';

const captureSchema = z.object({
  tabId: z.string().min(1),
  windowId: z.number().int(),
});

const zipPathSchema = z.object({
  zipPath: z.string().min(1),
});

let service: BugSnapshotService | null = null;

export function registerBugSnapshotHandlers(ctx: IpcContext): void {
  initConsoleBuffers();
  service = new BugSnapshotService(ctx.tabManager, ctx.logger);

  ipcMain.handle(
    IPC_CHANNELS.BUG_SNAPSHOT_CAPTURE,
    async (event, payload): Promise<IpcResponse<{ zipPath: string }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.BUG_SNAPSHOT_CAPTURE);
      const parsed = captureSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const { repos, windowId } = getFrameContext(event, ctx);
        const raw = repos.settings.get('bug-snapshot:include-network');
        const includeNetwork = raw !== null ? (JSON.parse(raw) as boolean) : true;
        void windowId;
        const zipPath = await service!.capture(
          parsed.data.tabId,
          parsed.data.windowId,
          includeNetwork,
        );
        const parentWin = BrowserWindow.fromId(parsed.data.windowId);
        parentWin?.webContents.send(IPC_EVENTS.BUG_SNAPSHOT_COMPLETE, { zipPath });
        return { ok: true, data: { zipPath } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.BUG_SNAPSHOT_CAPTURE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.BUG_SNAPSHOT_SHOW_IN_FOLDER,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.BUG_SNAPSHOT_SHOW_IN_FOLDER);
      const parsed = zipPathSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        shell.showItemInFolder(parsed.data.zipPath);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.BUG_SNAPSHOT_SHOW_IN_FOLDER);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.BUG_SNAPSHOT_OPEN_FILE,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.BUG_SNAPSHOT_OPEN_FILE);
      const parsed = zipPathSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        await shell.openPath(parsed.data.zipPath);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.BUG_SNAPSHOT_OPEN_FILE);
      }
    },
  );
}

export { service as bugSnapshotService };

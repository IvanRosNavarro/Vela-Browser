import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS, z, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';
import { MEDIA_POPUP_WIDTH } from '../media/MediaPopupWindow';

const tabIdSchema = z.object({ tabId: z.string() });
const openPopupSchema = z.object({ x: z.number(), y: z.number() });
const activateTabSchema = z.object({
  tabId: z.string(),
  windowId: z.number().int(),
});
const seekBySchema = z.object({ tabId: z.string(), delta: z.number() });

export function registerMediaHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.MEDIA_GET_SOURCES,
    (event): IpcResponse<ReturnType<typeof ctx.mediaManager.getSources>> => {
      guardTrustedFrame(event, IPC_CHANNELS.MEDIA_GET_SOURCES);
      try {
        return { ok: true, data: ctx.mediaManager.getSources() };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MEDIA_GET_SOURCES);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.MEDIA_PLAY,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.MEDIA_PLAY);
      const parsed = tabIdSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        await ctx.mediaManager.play(parsed.data.tabId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MEDIA_PLAY);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.MEDIA_PAUSE,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.MEDIA_PAUSE);
      const parsed = tabIdSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        await ctx.mediaManager.pause(parsed.data.tabId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MEDIA_PAUSE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.MEDIA_SKIP_NEXT,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.MEDIA_SKIP_NEXT);
      const parsed = tabIdSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        await ctx.mediaManager.skipNext(parsed.data.tabId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MEDIA_SKIP_NEXT);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.MEDIA_SKIP_PREV,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.MEDIA_SKIP_PREV);
      const parsed = tabIdSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        await ctx.mediaManager.skipPrev(parsed.data.tabId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MEDIA_SKIP_PREV);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.MEDIA_ACTIVATE_TAB,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.MEDIA_ACTIVATE_TAB);
      const parsed = activateTabSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        await ctx.tabManager.activateTab(parsed.data.windowId, parsed.data.tabId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MEDIA_ACTIVATE_TAB);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.MEDIA_SEEK_BY,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.MEDIA_SEEK_BY);
      const parsed = seekBySchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        await ctx.mediaManager.seekBy(parsed.data.tabId, parsed.data.delta);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MEDIA_SEEK_BY);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.MEDIA_OPEN_POPUP,
    async (event, payload): Promise<IpcResponse<null>> => {
      guardTrustedFrame(event, IPC_CHANNELS.MEDIA_OPEN_POPUP);
      const parsed = openPopupSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const senderWin = BrowserWindow.fromWebContents(event.sender);
        if (!senderWin) return { ok: true, data: null };
        const bounds = senderWin.getBounds();
        const screenX = bounds.x + parsed.data.x - MEDIA_POPUP_WIDTH;
        const screenY = bounds.y + parsed.data.y;
        ctx.mediaPopupWindow.toggle(screenX, screenY);
        return { ok: true, data: null };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MEDIA_OPEN_POPUP);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.MEDIA_CLOSE_POPUP,
    (event): IpcResponse<null> => {
      guardTrustedFrame(event, IPC_CHANNELS.MEDIA_CLOSE_POPUP);
      ctx.mediaPopupWindow.hide();
      return { ok: true, data: null };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.MEDIA_GET_CURRENT_TIME,
    async (event, payload): Promise<IpcResponse<{ currentTime: number; duration: number | null }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.MEDIA_GET_CURRENT_TIME);
      const parsed = tabIdSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const data = await ctx.mediaManager.getCurrentTime(parsed.data.tabId);
        return { ok: true, data };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MEDIA_GET_CURRENT_TIME);
      }
    },
  );
}

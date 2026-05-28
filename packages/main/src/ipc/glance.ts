import { ipcMain } from 'electron';
import { IPC_CHANNELS, z, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';

const anchorRectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  bottom: z.number(),
});

const modifiersSchema = z.object({
  alt: z.boolean(),
  ctrl: z.boolean(),
  shift: z.boolean(),
  meta: z.boolean(),
});

const showSchema = z.object({
  url: z.string().url(),
  anchorRect: anchorRectSchema,
  modifiers: modifiersSchema,
});

const openInTabSchema = z.object({
  url: z.string(),
  windowId: z.number().int(),
});

export function registerGlanceHandlers(ctx: IpcContext): void {
  // ── glance:should-show-sync (synchronous check from webTab preload) ─────────
  // The preload calls this before calling preventDefault() on mousedown so that
  // only the configured modifier intercepts clicks (the other keeps native behavior).
  ipcMain.on('glance:should-show-sync', (event, payload: unknown) => {
    const parsed = modifiersSchema.safeParse(payload);
    event.returnValue =
      parsed.success &&
      ctx.glanceManager.isEnabled() &&
      ctx.glanceManager.checkModifiers(parsed.data);
  });

  // ── glance:show (fire-and-forget from webTab preload) ─────────────────────
  ipcMain.on('glance:show', (event, payload: unknown) => {
    const parsed = showSchema.safeParse(payload);
    if (!parsed.success) return;

    // Resolve window via TabManager: BrowserWindow.fromWebContents() returns
    // null for WCV webContents, so we traverse tab→window instead.
    const tabId = ctx.tabManager.getTabIdForWebContents(event.sender.id);
    const windowId = tabId ? ctx.tabManager.getWindowIdForTab(tabId) : null;
    if (windowId === null) return;

    void ctx.glanceManager.show(
      windowId,
      parsed.data.url,
      parsed.data.anchorRect,
      parsed.data.modifiers,
    ).catch((err: unknown) => {
      ctx.logger.warn('[glance] show error', err);
    });
  });

  // ── glance:close (invokeable from glance toolbar page) ────────────────────
  ipcMain.handle(
    IPC_CHANNELS.GLANCE_CLOSE,
    async (event): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.GLANCE_CLOSE);
      try {
        await ctx.glanceManager.hide();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.GLANCE_CLOSE);
      }
    },
  );

  // ── glance:open-in-tab (invokeable from glance toolbar page) ─────────────
  ipcMain.handle(
    IPC_CHANNELS.GLANCE_OPEN_IN_TAB,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.GLANCE_OPEN_IN_TAB);
      const parsed = openInTabSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        await ctx.glanceManager.openInTab(parsed.data.windowId, parsed.data.url);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.GLANCE_OPEN_IN_TAB);
      }
    },
  );

  // ── glance:open-in-split (invokeable from glance toolbar page) ───────────
  ipcMain.handle(
    IPC_CHANNELS.GLANCE_OPEN_IN_SPLIT,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.GLANCE_OPEN_IN_SPLIT);
      const parsed = openInTabSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        await ctx.glanceManager.openInSplit(parsed.data.windowId, parsed.data.url);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.GLANCE_OPEN_IN_SPLIT);
      }
    },
  );
}

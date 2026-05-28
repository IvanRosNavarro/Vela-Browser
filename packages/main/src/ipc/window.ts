import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  IPC_CHANNELS,
  z,
  windowOpenUrlInNewTabInputSchema,
  type IpcResponse,
  type TabNode,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { InvariantViolationError } from '../lib/errors';
import { guardTrustedFrame } from './validate';
import { setAddressBarEditing } from '../shortcuts';

const titlebarOverlaySchema = z.object({
  color: z.string().optional(),
  symbolColor: z.string().optional(),
});

function resolveWindow(event: IpcMainInvokeEvent): BrowserWindow | null {
  return (
    BrowserWindow.fromWebContents(event.sender) ??
    (event.sender as typeof event.sender & { getOwnerBrowserWindow?(): BrowserWindow | null }).getOwnerBrowserWindow?.() ??
    null
  );
}

function resolveWindowId(event: IpcMainInvokeEvent): number | null {
  return resolveWindow(event)?.id ?? null;
}

export function registerWindowHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.WINDOW_OPEN_URL_IN_NEW_TAB,
    async (event, payload): Promise<IpcResponse<TabNode>> => {
      guardTrustedFrame(event, IPC_CHANNELS.WINDOW_OPEN_URL_IN_NEW_TAB);
      const parsed = windowOpenUrlInNewTabInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError(
            'window:open-url-in-new-tab: webContents sin BrowserWindow asociada',
          );
        }
        const workspaceId = ctx.tabManager.getWorkspaceForWindow(windowId);
        if (!workspaceId) {
          throw new InvariantViolationError(
            `window:open-url-in-new-tab: window ${windowId} sin workspace asociado`,
          );
        }
        const tab = await ctx.tabManager.createTab(windowId, {
          workspaceId,
          parentId: parsed.data.parentId ?? null,
          url: parsed.data.url,
          activate: parsed.data.activate ?? true,
        });
        return { ok: true, data: tab };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WINDOW_OPEN_URL_IN_NEW_TAB);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_MINIMIZE,
    async (event): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.WINDOW_MINIMIZE);
      try {
        const win = resolveWindow(event);
        if (win && !win.isDestroyed()) win.minimize();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WINDOW_MINIMIZE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE,
    async (event): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE);
      try {
        const win = resolveWindow(event);
        if (win && !win.isDestroyed()) {
          if (win.isMaximized()) win.unmaximize();
          else win.maximize();
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_CLOSE,
    async (event): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.WINDOW_CLOSE);
      try {
        const win = resolveWindow(event);
        if (win && !win.isDestroyed()) win.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WINDOW_CLOSE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_IS_MAXIMIZED,
    async (event): Promise<IpcResponse<{ maximized: boolean }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.WINDOW_IS_MAXIMIZED);
      try {
        const win = resolveWindow(event);
        return { ok: true, data: { maximized: win?.isMaximized() ?? false } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WINDOW_IS_MAXIMIZED);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_UPDATE_TITLEBAR_OVERLAY,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.WINDOW_UPDATE_TITLEBAR_OVERLAY);
      const parsed = titlebarOverlaySchema.safeParse(payload ?? {});
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const win = resolveWindow(event);
        if (win && !win.isDestroyed() && process.platform === 'win32') {
          try {
            win.setTitleBarOverlay({
              color: parsed.data.color,
              symbolColor: parsed.data.symbolColor,
              height: 32,
            });
          } catch {
            // Popup windows (e.g. media popup) don't have titlebar overlay enabled
          }
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WINDOW_UPDATE_TITLEBAR_OVERLAY);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN,
    async (event): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN);
      try {
        const win = resolveWindow(event);
        if (win && !win.isDestroyed()) {
          win.setFullScreen(!win.isFullScreen());
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WINDOW_IS_FULLSCREEN,
    async (event): Promise<IpcResponse<{ fullscreen: boolean }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.WINDOW_IS_FULLSCREEN);
      try {
        const win = resolveWindow(event);
        return { ok: true, data: { fullscreen: win?.isFullScreen() ?? false } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WINDOW_IS_FULLSCREEN);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.NAV_SET_ADDRESSBAR_EDITING,
    (event, payload): IpcResponse<void> => {
      guardTrustedFrame(event, IPC_CHANNELS.NAV_SET_ADDRESSBAR_EDITING);
      const parsed = z.object({ editing: z.boolean() }).safeParse(payload);
      if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      const windowId = resolveWindowId(event);
      if (windowId !== null) setAddressBarEditing(windowId, parsed.data.editing);
      return { ok: true, data: undefined };
    },
  );
}

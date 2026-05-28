import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  IPC_CHANNELS,
  navGotoInputSchema,
  navSimpleInputSchema,
  type IpcResponse,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';
import { InvariantViolationError } from '../lib/errors';

function resolveWindowId(event: IpcMainInvokeEvent): number | null {
  const win =
    BrowserWindow.fromWebContents(event.sender) ??
    (event.sender as typeof event.sender & { getOwnerBrowserWindow?(): BrowserWindow | null }).getOwnerBrowserWindow?.() ??
    null;
  return win?.id ?? null;
}

export function registerNavigationHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.NAV_BACK,
    async (event, payload): Promise<IpcResponse<{ id: string }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.NAV_BACK);
      const parsed = navSimpleInputSchema.safeParse(payload);
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
            'nav:back: webContents sin BrowserWindow asociada',
          );
        }
        ctx.tabManager.goBack(windowId);
        return { ok: true, data: { id: parsed.data.id } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NAV_BACK);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.NAV_FORWARD,
    async (event, payload): Promise<IpcResponse<{ id: string }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.NAV_FORWARD);
      const parsed = navSimpleInputSchema.safeParse(payload);
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
            'nav:forward: webContents sin BrowserWindow asociada',
          );
        }
        ctx.tabManager.goForward(windowId);
        return { ok: true, data: { id: parsed.data.id } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NAV_FORWARD);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.NAV_RELOAD,
    async (event, payload): Promise<IpcResponse<{ id: string }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.NAV_RELOAD);
      const parsed = navSimpleInputSchema.safeParse(payload);
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
            'nav:reload: webContents sin BrowserWindow asociada',
          );
        }
        ctx.tabManager.reload(windowId);
        return { ok: true, data: { id: parsed.data.id } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NAV_RELOAD);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.NAV_STOP,
    async (event, payload): Promise<IpcResponse<{ id: string }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.NAV_STOP);
      const parsed = navSimpleInputSchema.safeParse(payload);
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
            'nav:stop: webContents sin BrowserWindow asociada',
          );
        }
        ctx.tabManager.stop(windowId);
        return { ok: true, data: { id: parsed.data.id } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NAV_STOP);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.NAV_GOTO,
    async (event, payload): Promise<IpcResponse<{ id: string }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.NAV_GOTO);
      const parsed = navGotoInputSchema.safeParse(payload);
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
            'nav:goto: webContents sin BrowserWindow asociada',
          );
        }
        ctx.tabManager.goto(windowId, parsed.data.url);
        return { ok: true, data: { id: parsed.data.id } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NAV_GOTO);
      }
    },
  );
}

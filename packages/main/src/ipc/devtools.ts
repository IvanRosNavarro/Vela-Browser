import { BrowserWindow, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  devtoolsSetEmulationInputSchema,
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

export function registerDevtoolsHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.DEVTOOLS_SET_EMULATION,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.DEVTOOLS_SET_EMULATION);
      const parsed = devtoolsSetEmulationInputSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError(
            'devtools:set-emulation: webContents sin BrowserWindow asociada',
          );
        }
        ctx.tabManager.setDeviceEmulation(windowId, parsed.data);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DEVTOOLS_SET_EMULATION);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DEVTOOLS_CLEAR_EMULATION,
    async (event): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DEVTOOLS_CLEAR_EMULATION);
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError(
            'devtools:clear-emulation: webContents sin BrowserWindow asociada',
          );
        }
        ctx.tabManager.clearDeviceEmulation(windowId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DEVTOOLS_CLEAR_EMULATION);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DEVMODE_TOGGLE_EMULATION,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DEVMODE_TOGGLE_EMULATION);
        const { parentWindowId } = payload as { parentWindowId: number };
        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (parentWin && !parentWin.isDestroyed()) {
          parentWin.webContents.send(IPC_EVENTS.DEVICE_EMULATION_TOGGLE_REQUEST);
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DEVMODE_TOGGLE_EMULATION);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DEVTOOLS_OPEN_RESPONSIVE,
    async (event): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DEVTOOLS_OPEN_RESPONSIVE);
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError('devtools:open-responsive: sin BrowserWindow');
        }
        const activeTabId = ctx.tabManager.getActiveTabId(windowId);
        if (!activeTabId) return { ok: true, data: undefined };
        const wcv = ctx.tabManager.getWcvForTab(activeTabId);
        if (!wcv) return { ok: true, data: undefined };
        if (!wcv.webContents.isDevToolsOpened()) {
          wcv.webContents.openDevTools({ mode: 'detach' });
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DEVTOOLS_OPEN_RESPONSIVE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DEVTOOLS_CLOSE_RESPONSIVE,
    async (event): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DEVTOOLS_CLOSE_RESPONSIVE);
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError('devtools:close-responsive: sin BrowserWindow');
        }
        const activeTabId = ctx.tabManager.getActiveTabId(windowId);
        if (!activeTabId) return { ok: true, data: undefined };
        const wcv = ctx.tabManager.getWcvForTab(activeTabId);
        if (wcv?.webContents.isDevToolsOpened()) {
          wcv.webContents.closeDevTools();
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DEVTOOLS_CLOSE_RESPONSIVE);
      }
    },
  );
}

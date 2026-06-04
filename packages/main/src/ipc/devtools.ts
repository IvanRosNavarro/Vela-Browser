import { BrowserWindow, ipcMain, desktopCapturer, screen, type IpcMainInvokeEvent } from 'electron';
import { getPreloadPath } from './popupUtils';
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

let eyedropperInterval: ReturnType<typeof setInterval> | null = null;
let eyedropperWindowId: number | null = null;
const eyedropperPopups = new Map<number, BrowserWindow>(); // parentWindowId → BW

function stopEyedropperPolling(): void {
  if (eyedropperInterval !== null) { clearInterval(eyedropperInterval); eyedropperInterval = null; }
  eyedropperWindowId = null;
}

async function captureEyedropperFrame(win: BrowserWindow): Promise<void> {
  try {
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    const W = 400;
    const H = Math.round(400 * (display.bounds.height / display.bounds.width));

    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: W, height: H } });
    const source = sources[0];
    if (!source || win.isDestroyed()) return;

    const relX = Math.max(0, Math.min(1, (point.x - display.bounds.x) / display.bounds.width));
    const relY = Math.max(0, Math.min(1, (point.y - display.bounds.y) / display.bounds.height));
    const tx = Math.floor(relX * W);
    const ty = Math.floor(relY * H);

    const bitmap = source.thumbnail.toBitmap();
    const idx = (ty * W + tx) * 4;
    const b = bitmap[idx] ?? 0;
    const g = bitmap[idx + 1] ?? 0;
    const r = bitmap[idx + 2] ?? 0;
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`.toUpperCase();

    const CROP = 20;
    const cropX = Math.max(0, Math.min(W - CROP * 2, tx - CROP));
    const cropY = Math.max(0, Math.min(H - CROP * 2, ty - CROP));
    const cropped = source.thumbnail.crop({ x: cropX, y: cropY, width: CROP * 2, height: CROP * 2 });
    const cropDataUrl = cropped.toDataURL();

    win.webContents.send(IPC_EVENTS.DEVTOOLS_EYEDROPPER_FRAME, { hex, r, g, b, cropDataUrl });
  } catch { /* ignore frame errors */ }
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

  ipcMain.handle(
    IPC_CHANNELS.DEVTOOLS_EYEDROPPER_START,
    async (event): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DEVTOOLS_EYEDROPPER_START);
        const windowId = resolveWindowId(event);
        if (windowId === null) return { ok: true, data: undefined };
        const win = BrowserWindow.fromId(windowId);
        if (!win || win.isDestroyed()) return { ok: true, data: undefined };

        if (eyedropperInterval !== null) clearInterval(eyedropperInterval);
        eyedropperWindowId = windowId;
        eyedropperInterval = setInterval(() => { void captureEyedropperFrame(win); }, 67); // ~15fps
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DEVTOOLS_EYEDROPPER_START);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DEVTOOLS_EYEDROPPER_STOP,
    async (event): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DEVTOOLS_EYEDROPPER_STOP);
        if (eyedropperInterval !== null) { clearInterval(eyedropperInterval); eyedropperInterval = null; }
        eyedropperWindowId = null;
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DEVTOOLS_EYEDROPPER_STOP);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DEVTOOLS_GET_TAB_CSS_VALUES,
    async (event): Promise<IpcResponse<{ fontSize: number; vpWidth: number; vpHeight: number }>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DEVTOOLS_GET_TAB_CSS_VALUES);
        const windowId = resolveWindowId(event);
        if (windowId === null) return { ok: true, data: { fontSize: 16, vpWidth: 1440, vpHeight: 900 } };
        const activeTabId = ctx.tabManager.getActiveTabId(windowId);
        if (!activeTabId) return { ok: true, data: { fontSize: 16, vpWidth: 1440, vpHeight: 900 } };
        const wcv = ctx.tabManager.getWcvForTab(activeTabId);
        if (!wcv) return { ok: true, data: { fontSize: 16, vpWidth: 1440, vpHeight: 900 } };

        const result = await wcv.webContents.executeJavaScript(
          '({ fontSize: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16, vpWidth: window.innerWidth, vpHeight: window.innerHeight })',
          false,
        ) as { fontSize: number; vpWidth: number; vpHeight: number };

        return { ok: true, data: result };
      } catch {
        return { ok: true, data: { fontSize: 16, vpWidth: 1440, vpHeight: 900 } };
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DEVTOOLS_EYEDROPPER_SHOW_WINDOW,
    async (event, rawArgs): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DEVTOOLS_EYEDROPPER_SHOW_WINDOW);
        const { parentWindowId } = rawArgs as { parentWindowId: number };
        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin || parentWin.isDestroyed()) return { ok: true, data: undefined };

        // Close any existing eyedropper for this window
        const existing = eyedropperPopups.get(parentWindowId);
        if (existing && !existing.isDestroyed()) existing.close();

        const bounds = parentWin.getBounds();
        const preloadPath = getPreloadPath();

        const popup = new BrowserWindow({
          x: bounds.x, y: bounds.y,
          width: bounds.width, height: bounds.height,
          frame: false,
          transparent: true,
          alwaysOnTop: true,
          skipTaskbar: true,
          hasShadow: false,
          resizable: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            ...(preloadPath ? { preload: preloadPath } : {}),
          },
        });

        eyedropperPopups.set(parentWindowId, popup);

        // Start polling frames to this popup
        stopEyedropperPolling();
        eyedropperWindowId = parentWindowId;
        eyedropperInterval = setInterval(() => { void captureEyedropperFrame(popup); }, 67);

        popup.on('closed', () => {
          eyedropperPopups.delete(parentWindowId);
          if (eyedropperWindowId === parentWindowId) stopEyedropperPolling();
        });

        const isDev = !!process.env['VITE_DEV_SERVER_URL'];
        const VITE_DEV_URL = process.env['VITE_DEV_SERVER_URL'] ?? 'http://localhost:5173';
        const url = isDev
          ? `${VITE_DEV_URL}/src/pages/devtools-eyedropper/index.html?windowId=${parentWindowId}`
          : new URL(`vela://devtools-eyedropper?windowId=${parentWindowId}`).toString();

        if (isDev) {
          void popup.loadURL(url);
        } else {
          void popup.loadURL(`vela://devtools-eyedropper?windowId=${parentWindowId}`);
        }
        popup.show();

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DEVTOOLS_EYEDROPPER_SHOW_WINDOW);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DEVTOOLS_EYEDROPPER_PICK_COLOR,
    async (event, rawArgs): Promise<IpcResponse<void>> => {
      try {
        const { parentWindowId, hex, r, g, b } = rawArgs as { parentWindowId: number; hex: string; r: number; g: number; b: number };

        // Stop polling and close the eyedropper popup
        stopEyedropperPolling();
        const popup = eyedropperPopups.get(parentWindowId);
        if (popup && !popup.isDestroyed()) popup.close();
        eyedropperPopups.delete(parentWindowId);

        // Notify the parent shell renderer
        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (parentWin && !parentWin.isDestroyed()) {
          parentWin.webContents.send(IPC_EVENTS.DEVTOOLS_COLOR_PICKED, { hex, r, g, b });
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DEVTOOLS_EYEDROPPER_PICK_COLOR);
      }
    },
  );
}

import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  IPC_CHANNELS,
  z,
  layoutSetAddressBarHeightInputSchema,
  layoutSetNotificationPanelWidthInputSchema,
  layoutSetOverlayInputSchema,
  layoutSidebarWidthInputSchema,
  type IpcResponse,
  type WindowLayout,
  type PanelId,
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

export function registerLayoutHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.LAYOUT_SIDEBAR_WIDTH_CHANGED,
    async (event, payload): Promise<IpcResponse<{ width: number }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.LAYOUT_SIDEBAR_WIDTH_CHANGED);
      const parsed = layoutSidebarWidthInputSchema.safeParse(payload);
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
            'layout:sidebar-width-changed: webContents sin BrowserWindow asociada',
          );
        }
        ctx.tabManager.setSidebarWidth(windowId, parsed.data.width);
        return { ok: true, data: { width: parsed.data.width } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.LAYOUT_SIDEBAR_WIDTH_CHANGED);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.LAYOUT_SET_OVERLAY,
    async (event, payload): Promise<IpcResponse<{ active: boolean }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.LAYOUT_SET_OVERLAY);
      const parsed = layoutSetOverlayInputSchema.safeParse(payload);
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
            'layout:set-overlay: webContents sin BrowserWindow asociada',
          );
        }
        ctx.tabManager.setOverlayActive(windowId, parsed.data.active);
        return { ok: true, data: { active: parsed.data.active } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.LAYOUT_SET_OVERLAY);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.LAYOUT_SET_ADDRESS_BAR_HEIGHT,
    async (event, payload): Promise<IpcResponse<{ height: number }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.LAYOUT_SET_ADDRESS_BAR_HEIGHT);
      const parsed = layoutSetAddressBarHeightInputSchema.safeParse(payload);
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
            'layout:set-address-bar-height: webContents sin BrowserWindow asociada',
          );
        }
        ctx.tabManager.setAddressBarHeight(windowId, parsed.data.height);
        return { ok: true, data: { height: parsed.data.height } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.LAYOUT_SET_ADDRESS_BAR_HEIGHT);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.LAYOUT_SET_NOTIFICATION_PANEL_WIDTH,
    async (event, payload): Promise<IpcResponse<{ width: number }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.LAYOUT_SET_NOTIFICATION_PANEL_WIDTH);
      const parsed = layoutSetNotificationPanelWidthInputSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError(
            'layout:set-notification-panel-width: webContents sin BrowserWindow asociada',
          );
        }
        ctx.tabManager.setNotificationPanelWidth(windowId, parsed.data.width);
        return { ok: true, data: { width: parsed.data.width } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.LAYOUT_SET_NOTIFICATION_PANEL_WIDTH);
      }
    },
  );

  const setSplitSchema = z.object({
    mode: z.enum(['split-h', 'split-v']),
    tabIdForNewPanel: z.string().optional(),
  });

  ipcMain.handle(
    IPC_CHANNELS.LAYOUT_SET_SPLIT,
    async (event, payload): Promise<IpcResponse<WindowLayout>> => {
      guardTrustedFrame(event, IPC_CHANNELS.LAYOUT_SET_SPLIT);
      const parsed = setSplitSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) throw new InvariantViolationError('layout:set-split: sin BrowserWindow');
        const layout = await ctx.layoutManager.setSplit(windowId, parsed.data.mode, parsed.data.tabIdForNewPanel);
        return { ok: true, data: layout };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.LAYOUT_SET_SPLIT);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.LAYOUT_CLOSE_SPLIT,
    async (event): Promise<IpcResponse<WindowLayout>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.LAYOUT_CLOSE_SPLIT);
        const windowId = resolveWindowId(event);
        if (windowId === null) throw new InvariantViolationError('layout:close-split: sin BrowserWindow');
        const layout = await ctx.layoutManager.closeSplit(windowId);
        return { ok: true, data: layout };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.LAYOUT_CLOSE_SPLIT);
      }
    },
  );

  const setRatioSchema = z.object({ ratio: z.number().min(0.1).max(0.9) });

  ipcMain.handle(
    IPC_CHANNELS.LAYOUT_SET_RATIO,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.LAYOUT_SET_RATIO);
      const parsed = setRatioSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) throw new InvariantViolationError('layout:set-ratio: sin BrowserWindow');
        ctx.layoutManager.setSplitRatio(windowId, parsed.data.ratio);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.LAYOUT_SET_RATIO);
      }
    },
  );

  const setPanelSchema = z.object({ panelId: z.enum(['left', 'right', 'top', 'bottom']) });

  ipcMain.handle(
    IPC_CHANNELS.LAYOUT_SET_FOCUSED_PANEL,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.LAYOUT_SET_FOCUSED_PANEL);
      const parsed = setPanelSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) throw new InvariantViolationError('layout:set-focused-panel: sin BrowserWindow');
        ctx.layoutManager.setFocusedPanel(windowId, parsed.data.panelId as PanelId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.LAYOUT_SET_FOCUSED_PANEL);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.LAYOUT_GET,
    async (event): Promise<IpcResponse<WindowLayout>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.LAYOUT_GET);
        const windowId = resolveWindowId(event);
        if (windowId === null) throw new InvariantViolationError('layout:get: sin BrowserWindow');
        return { ok: true, data: ctx.layoutManager.getLayout(windowId) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.LAYOUT_GET);
      }
    },
  );

  const openTabInUnfocusedSchema = z.object({
    tabId: z.string(),
    windowId: z.number().int(),
  });

  ipcMain.handle(
    IPC_CHANNELS.LAYOUT_OPEN_TAB_IN_UNFOCUSED_PANEL,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.LAYOUT_OPEN_TAB_IN_UNFOCUSED_PANEL);
      const parsed = openTabInUnfocusedSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        await ctx.layoutManager.openTabInUnfocusedPanel(parsed.data.windowId, parsed.data.tabId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.LAYOUT_OPEN_TAB_IN_UNFOCUSED_PANEL);
      }
    },
  );
}

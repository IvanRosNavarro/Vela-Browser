import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS, type IpcResponse, type ExtendedSuggestion } from '@vela/shared';
import type { IpcContext } from './context';
import { getFrameContext, resolveWindowId } from './helpers';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';
import { GlobalSettings } from '../settings';
import {
  createPopupWindow,
  wirePopupLifecycle,
  clampToDisplay,
  applyGlassUrlParams,
  type GlassParams,
} from './popupUtils';

type ReposWithSettings = { settings: { get(key: string): string | null | undefined } };

function readGlass(repos: ReposWithSettings): GlassParams | null {
  if (repos.settings.get('ui:glassmorphism') !== 'true') return null;
  const intensity = Number(repos.settings.get('ui:glassmorphism-intensity') ?? 60);
  const opacity = Number(repos.settings.get('ui:glassmorphism-opacity') ?? 60);
  return {
    blurPx: Math.round(16 + (intensity / 100) * 8),
    bgOpacity: parseFloat((0.20 + (opacity / 100) * 0.65).toFixed(2)),
  };
}


const downloadPopups = new Map<number, BrowserWindow>();
const tabPreviewPopups = new Map<number, BrowserWindow>();
const toolsClusterPopups = new Map<number, BrowserWindow>();
const statusClusterPopups = new Map<number, BrowserWindow>();
const securityPopups = new Map<number, BrowserWindow>();
const devmodePopups = new Map<number, BrowserWindow>();
const suggestionsPopups = new Map<number, BrowserWindow>();
const workspaceDropdownPopups = new Map<number, BrowserWindow>();
const profileDropdownPopups = new Map<number, BrowserWindow>();
const velaMenuPopups = new Map<number, BrowserWindow>();
const addNodeMenuPopups = new Map<number, BrowserWindow>();
const notificationPermissionPopups = new Map<number, BrowserWindow>();
// Reverse map: popupWindowId → parentWindowId (for suggestions:select routing)
const suggestionsPopupToParent = new Map<number, number>();
// Initial data stored in memory to avoid URL length limits with long history URLs
const suggestionsInitialData = new Map<number, { suggestions: ExtendedSuggestion[]; selectedIndex: number }>();

export function registerPopupHandlers(ctx: IpcContext): void {
  // ── security:open-popup ───────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.SECURITY_OPEN_POPUP,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.SECURITY_OPEN_POPUP);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId === null) return { ok: true, data: undefined };
        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin) return { ok: true, data: undefined };

        const existing = securityPopups.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.close();
          return { ok: true, data: undefined };
        }

        const { scheme, rawUrl, anchorRect } = payload as {
          scheme: string;
          rawUrl: string;
          anchorRect: { left: number; bottom: number; width: number };
        };

        const { profileId, repos } = getFrameContext(event, ctx);
        const glass = readGlass(repos);
        const POPUP_WIDTH = 300;
        const POPUP_HEIGHT = scheme === 'https' ? 200 : 140;

        const pos = parentWin.getPosition();
        const { x, y } = clampToDisplay(
          pos[0]! + Math.round(anchorRect.left),
          pos[1]! + Math.round(anchorRect.bottom) + 4,
          POPUP_WIDTH, POPUP_HEIGHT,
        );

        const popup = createPopupWindow({ width: POPUP_WIDTH, height: POPUP_HEIGHT, x, y, ...(glass ? { glassmorphism: glass } : {}) });
        wirePopupLifecycle(popup, { registry: securityPopups, parentWindowId, profileId, ctx });

        const pageUrl = new URL('vela://security-popup');
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        pageUrl.searchParams.set('scheme', scheme);
        pageUrl.searchParams.set('rawUrl', rawUrl);
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await popup.loadURL(pageUrl.toString());
        popup.show();

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SECURITY_OPEN_POPUP);
      }
    },
  );

  // ── security:close-popup ──────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.SECURITY_CLOSE_POPUP,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.SECURITY_CLOSE_POPUP);
        const { windowId } = payload as { windowId: number };
        const win = securityPopups.get(windowId);
        if (win && !win.isDestroyed()) win.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SECURITY_CLOSE_POPUP);
      }
    },
  );

  // ── devmode:open-popup ────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.DEVMODE_OPEN_POPUP,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DEVMODE_OPEN_POPUP);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId === null) return { ok: true, data: undefined };
        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin) return { ok: true, data: undefined };

        const existing = devmodePopups.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.close();
          return { ok: true, data: undefined };
        }

        const { activeTabId, currentUrl, devtoolsActive, anchorRect } = payload as {
          activeTabId: string | null;
          currentUrl: string;
          devtoolsActive: boolean;
          anchorRect: { right: number; bottom: number };
        };

        const { profileId, repos } = getFrameContext(event, ctx);
        const glass = readGlass(repos);
        const POPUP_WIDTH = 360;
        const POPUP_HEIGHT = 248;

        const pos = parentWin.getPosition();
        const { x, y } = clampToDisplay(
          pos[0]! + Math.round(anchorRect.right) - POPUP_WIDTH,
          pos[1]! + Math.round(anchorRect.bottom) + 6,
          POPUP_WIDTH, POPUP_HEIGHT,
        );

        const popup = createPopupWindow({ width: POPUP_WIDTH, height: POPUP_HEIGHT, x: Math.max(8, x), y, ...(glass ? { glassmorphism: glass } : {}) });
        wirePopupLifecycle(popup, { registry: devmodePopups, parentWindowId, profileId, ctx });

        const pageUrl = new URL('vela://devmode-popup');
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        if (activeTabId) pageUrl.searchParams.set('activeTabId', activeTabId);
        pageUrl.searchParams.set('currentUrl', currentUrl);
        pageUrl.searchParams.set('devtoolsActive', String(devtoolsActive));
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await popup.loadURL(pageUrl.toString());
        popup.show();

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DEVMODE_OPEN_POPUP);
      }
    },
  );

  // ── devmode:close-popup ───────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.DEVMODE_CLOSE_POPUP,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DEVMODE_CLOSE_POPUP);
        const { windowId } = payload as { windowId: number };
        const win = devmodePopups.get(windowId);
        if (win && !win.isDestroyed()) win.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DEVMODE_CLOSE_POPUP);
      }
    },
  );

  // ── devmode:toggle-responsive ─────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.DEVMODE_TOGGLE_RESPONSIVE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DEVMODE_TOGGLE_RESPONSIVE);
        const { parentWindowId } = payload as { parentWindowId: number };
        const activeTabId = ctx.tabManager.getActiveTabId(parentWindowId);
        if (!activeTabId) return { ok: true, data: undefined };
        const wcv = ctx.tabManager.getWcvForTab(activeTabId);
        if (!wcv) return { ok: true, data: undefined };
        if (wcv.webContents.isDevToolsOpened()) {
          wcv.webContents.closeDevTools();
        } else {
          wcv.webContents.openDevTools({ mode: 'detach' });
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DEVMODE_TOGGLE_RESPONSIVE);
      }
    },
  );

  // ── suggestions-popup:open ────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS_POPUP_OPEN,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.SUGGESTIONS_POPUP_OPEN);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId === null) return { ok: true, data: undefined };
        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin) return { ok: true, data: undefined };

        const { anchorRect, suggestions, selectedIndex } = payload as {
          anchorRect: { left: number; bottom: number; width: number };
          suggestions: ExtendedSuggestion[];
          selectedIndex: number;
        };

        const existing = suggestionsPopups.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.webContents.send(IPC_EVENTS.SUGGESTIONS_POPUP_DATA, { suggestions, selectedIndex });
          return { ok: true, data: undefined };
        }

        const { profileId, repos } = getFrameContext(event, ctx);
        const glass = readGlass(repos);
        const POPUP_WIDTH = Math.round(anchorRect.width);
        // Window is always full height; the renderer sizes itself via height:auto.
        // Transparent areas are click-through, so no BrowserWindow resize is needed.
        const POPUP_MAX_HEIGHT = 480;

        const pos = parentWin.getPosition();
        const { x, y } = clampToDisplay(
          pos[0]! + Math.round(anchorRect.left),
          pos[1]! + Math.round(anchorRect.bottom) + 4,
          POPUP_WIDTH, POPUP_MAX_HEIGHT,
        );

        const popup = createPopupWindow({
          width: POPUP_WIDTH, height: POPUP_MAX_HEIGHT, x, y,
          focusable: false, roundedCorners: false,
          transparent: true,
          backgroundColor: '#00000000',
          ...(glass ? { glassmorphism: glass } : {}),
        });
        wirePopupLifecycle(popup, { registry: suggestionsPopups, parentWindowId, profileId, ctx, closeOnBlur: false });
        suggestionsPopupToParent.set(popup.id, parentWindowId);
        popup.on('closed', () => {
          suggestionsPopupToParent.delete(popup.id);
          suggestionsInitialData.delete(parentWindowId);
        });

        // Store initial data in memory (URL params fail when history URLs are very long)
        suggestionsInitialData.set(parentWindowId, { suggestions, selectedIndex });

        const pageUrl = new URL('vela://suggestions-popup');
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await popup.loadURL(pageUrl.toString());
        popup.show();

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SUGGESTIONS_POPUP_OPEN);
      }
    },
  );

  // ── suggestions-popup:update ──────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS_POPUP_UPDATE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.SUGGESTIONS_POPUP_UPDATE);
        const { windowId, suggestions, selectedIndex } = payload as {
          windowId: number;
          suggestions: ExtendedSuggestion[];
          selectedIndex: number;
        };
        const popup = suggestionsPopups.get(windowId);
        if (!popup || popup.isDestroyed()) return { ok: true, data: undefined };

        popup.webContents.send(IPC_EVENTS.SUGGESTIONS_POPUP_DATA, { suggestions, selectedIndex });
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SUGGESTIONS_POPUP_UPDATE);
      }
    },
  );

  // ── suggestions-popup:close ───────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS_POPUP_CLOSE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.SUGGESTIONS_POPUP_CLOSE);
        const { windowId } = payload as { windowId: number };
        const popup = suggestionsPopups.get(windowId);
        if (popup && !popup.isDestroyed()) popup.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SUGGESTIONS_POPUP_CLOSE);
      }
    },
  );

  // ── workspace-dropdown:open ───────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_DROPDOWN_OPEN,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.WORKSPACE_DROPDOWN_OPEN);
        const senderWindowId = resolveWindowId(event);
        if (senderWindowId === null) return { ok: true, data: undefined };
        const senderWin = BrowserWindow.fromId(senderWindowId);
        if (!senderWin) return { ok: true, data: undefined };

        // Walk up to the top-level window for event routing (handles floating sidebar child windows)
        const topWin = senderWin.getParentWindow() ?? senderWin;
        const parentWindowId = topWin.id;

        const existing = workspaceDropdownPopups.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.close();
          return { ok: true, data: undefined };
        }

        const { anchorRect, workspaceCount } = payload as {
          anchorRect: { left: number; bottom: number };
          workspaceCount: number;
        };

        const { profileId, repos } = getFrameContext(event, ctx);
        const glass = readGlass(repos);
        const POPUP_WIDTH = 280;
        const POPUP_HEIGHT = Math.min(500, 89 + workspaceCount * 36);

        // anchorRect is relative to senderWin viewport, not topWin
        const pos = senderWin.getPosition();
        const { x, y } = clampToDisplay(
          pos[0]! + Math.round(anchorRect.left),
          pos[1]! + Math.round(anchorRect.bottom) + 4,
          POPUP_WIDTH, POPUP_HEIGHT,
        );

        const wsMod = new GlobalSettings(ctx.repositories.appMetadata)
          .get<'ctrl' | 'alt'>('workspaces:switch-modifier') === 'ctrl' ? 'Ctrl' : 'Alt';

        const popup = createPopupWindow({ width: POPUP_WIDTH, height: POPUP_HEIGHT, x, y, ...(glass ? { glassmorphism: glass } : {}) });
        wirePopupLifecycle(popup, { registry: workspaceDropdownPopups, parentWindowId, profileId, ctx });

        const pageUrl = new URL('vela://workspace-dropdown');
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        pageUrl.searchParams.set('modifier', wsMod);
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await popup.loadURL(pageUrl.toString());
        popup.show();

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WORKSPACE_DROPDOWN_OPEN);
      }
    },
  );

  // ── workspace-dropdown:close ──────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_DROPDOWN_CLOSE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.WORKSPACE_DROPDOWN_CLOSE);
        const { windowId } = payload as { windowId: number };
        const popup = workspaceDropdownPopups.get(windowId);
        if (popup && !popup.isDestroyed()) popup.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WORKSPACE_DROPDOWN_CLOSE);
      }
    },
  );

  // ── workspace-dropdown:trigger-modal ─────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_DROPDOWN_TRIGGER_MODAL,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.WORKSPACE_DROPDOWN_TRIGGER_MODAL);
        const { windowId, mode, editId } = payload as {
          windowId: number;
          mode: 'create' | 'manage' | 'edit';
          editId?: string;
        };
        const popup = workspaceDropdownPopups.get(windowId);
        if (popup && !popup.isDestroyed()) popup.close();
        const rawWin = BrowserWindow.fromId(windowId);
        const targetWin = rawWin?.getParentWindow() ?? rawWin ?? null;
        if (targetWin && !targetWin.isDestroyed()) {
          targetWin.webContents.send(IPC_EVENTS.WORKSPACE_MODAL_TRIGGER, { mode, editId });
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WORKSPACE_DROPDOWN_TRIGGER_MODAL);
      }
    },
  );

  // ── profile-dropdown:open ─────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.PROFILE_DROPDOWN_OPEN,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.PROFILE_DROPDOWN_OPEN);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId === null) return { ok: true, data: undefined };
        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin) return { ok: true, data: undefined };

        const existing = profileDropdownPopups.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.close();
          return { ok: true, data: undefined };
        }

        const { anchorRect, profileCount } = payload as {
          anchorRect: { left: number; top: number };
          profileCount: number;
        };

        const { profileId, repos } = getFrameContext(event, ctx);
        const glass = readGlass(repos);
        const POPUP_WIDTH = 280;
        const POPUP_HEIGHT = Math.min(500, 117 + profileCount * 36);

        const pos = parentWin.getPosition();
        const { x, y } = clampToDisplay(
          pos[0]! + Math.round(anchorRect.left),
          pos[1]! + Math.round(anchorRect.top) - POPUP_HEIGHT - 4,
          POPUP_WIDTH, POPUP_HEIGHT,
        );

        const popup = createPopupWindow({ width: POPUP_WIDTH, height: POPUP_HEIGHT, x, y, ...(glass ? { glassmorphism: glass } : {}) });
        wirePopupLifecycle(popup, { registry: profileDropdownPopups, parentWindowId, profileId, ctx });

        const pageUrl = new URL('vela://profile-dropdown');
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await popup.loadURL(pageUrl.toString());
        popup.show();

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_DROPDOWN_OPEN);
      }
    },
  );

  // ── profile-dropdown:close ────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.PROFILE_DROPDOWN_CLOSE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.PROFILE_DROPDOWN_CLOSE);
        const { windowId } = payload as { windowId: number };
        const popup = profileDropdownPopups.get(windowId);
        if (popup && !popup.isDestroyed()) popup.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_DROPDOWN_CLOSE);
      }
    },
  );

  // ── profile-dropdown:trigger-modal ────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.PROFILE_DROPDOWN_TRIGGER_MODAL,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.PROFILE_DROPDOWN_TRIGGER_MODAL);
        const { windowId, mode, profileId } = payload as {
          windowId: number;
          mode: 'create' | 'manage' | 'unlock';
          profileId?: string;
        };
        const popup = profileDropdownPopups.get(windowId);
        if (popup && !popup.isDestroyed()) popup.close();
        const parentWin = BrowserWindow.fromId(windowId);
        if (parentWin && !parentWin.isDestroyed()) {
          parentWin.webContents.send(IPC_EVENTS.PROFILE_MODAL_TRIGGER, { mode, profileId });
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PROFILE_DROPDOWN_TRIGGER_MODAL);
      }
    },
  );

  // ── suggestions-popup:select ──────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS_POPUP_SELECT,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.SUGGESTIONS_POPUP_SELECT);
        const { suggestion, newTab } = payload as { suggestion: ExtendedSuggestion; newTab: boolean };

        const popupWin = BrowserWindow.fromWebContents(event.sender);
        const popupWindowId = popupWin?.id;
        if (popupWindowId === undefined) return { ok: true, data: undefined };

        const parentWindowId = suggestionsPopupToParent.get(popupWindowId);
        if (parentWindowId === undefined) return { ok: true, data: undefined };

        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin || parentWin.isDestroyed()) return { ok: true, data: undefined };

        parentWin.webContents.send(IPC_EVENTS.SUGGESTIONS_POPUP_SELECTED, {
          suggestion,
          newTab,
          windowId: parentWindowId,
        });

        const popup = suggestionsPopups.get(parentWindowId);
        if (popup && !popup.isDestroyed()) popup.close();

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SUGGESTIONS_POPUP_SELECT);
      }
    },
  );

  // ── suggestions-popup:get-initial-data ───────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.SUGGESTIONS_POPUP_GET_INITIAL_DATA,
    (event): { suggestions: ExtendedSuggestion[]; selectedIndex: number } | null => {
      const popupWin = BrowserWindow.fromWebContents(event.sender);
      if (!popupWin) return null;
      const parentWindowId = suggestionsPopupToParent.get(popupWin.id);
      if (parentWindowId === undefined) return null;
      return suggestionsInitialData.get(parentWindowId) ?? null;
    },
  );

  // ── vela-menu:open ────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VELA_MENU_OPEN,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VELA_MENU_OPEN);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId === null) return { ok: true, data: undefined };
        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin) return { ok: true, data: undefined };

        const existing = velaMenuPopups.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.close();
          return { ok: true, data: undefined };
        }

        const { anchorRect } = payload as { anchorRect: { left: number; bottom: number } };
        const { profileId, repos } = getFrameContext(event, ctx);
        const glass = readGlass(repos);

        const POPUP_WIDTH = 320;
        const POPUP_HEIGHT = 480;

        const pos = parentWin.getPosition();
        const { x, y } = clampToDisplay(
          pos[0]! + Math.round(anchorRect.left),
          pos[1]! + Math.round(anchorRect.bottom) + 4,
          POPUP_WIDTH, POPUP_HEIGHT,
        );

        const popup = createPopupWindow({ width: POPUP_WIDTH, height: POPUP_HEIGHT, x, y, ...(glass ? { glassmorphism: glass } : {}) });
        wirePopupLifecycle(popup, { registry: velaMenuPopups, parentWindowId, profileId, ctx });

        const pageUrl = new URL('vela://vela-menu');
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        if (ctx.tabManager.isBlindedWindow(parentWindowId)) {
          pageUrl.searchParams.set('isBlinded', '1');
        }
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await popup.loadURL(pageUrl.toString());
        popup.show();

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VELA_MENU_OPEN);
      }
    },
  );

  // ── vela-menu:close ───────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VELA_MENU_CLOSE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VELA_MENU_CLOSE);
        const { windowId } = payload as { windowId: number };
        const popup = velaMenuPopups.get(windowId);
        if (popup && !popup.isDestroyed()) popup.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VELA_MENU_CLOSE);
      }
    },
  );

  // ── vela-menu:navigate ────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.VELA_MENU_NAVIGATE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.VELA_MENU_NAVIGATE);
        const { windowId, url } = payload as { windowId: number; url: string };

        const popup = velaMenuPopups.get(windowId);
        if (popup && !popup.isDestroyed()) popup.close();

        const parentWin = BrowserWindow.fromId(windowId);
        if (!parentWin || parentWin.isDestroyed()) return { ok: true, data: undefined };

        const workspaceId = ctx.tabManager.getWorkspaceForWindow(windowId);
        if (!workspaceId) return { ok: true, data: undefined };

        await ctx.tabManager.createTab(windowId, { workspaceId, url, activate: true, parentId: null });
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.VELA_MENU_NAVIGATE);
      }
    },
  );

  // ── add-node-menu:open ────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.ADD_NODE_MENU_OPEN,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ADD_NODE_MENU_OPEN);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId === null) return { ok: true, data: undefined };
        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin) return { ok: true, data: undefined };

        const existing = addNodeMenuPopups.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.close();
          return { ok: true, data: undefined };
        }

        const { anchorRect, workspaceId, parentId, itemCount = 4 } = payload as {
          anchorRect: { left: number; bottom: number };
          workspaceId: string;
          parentId: string | null;
          itemCount?: number;
        };

        const { profileId, repos } = getFrameContext(event, ctx);
        const glass = readGlass(repos);
        const POPUP_WIDTH = 250;
        // 8px container padding + ~38px per item + 9px separator
        const POPUP_HEIGHT = 8 + itemCount * 35 + 9;

        const pos = parentWin.getPosition();
        const { x, y } = clampToDisplay(
          pos[0]! + Math.round(anchorRect.left),
          pos[1]! + Math.round(anchorRect.bottom) + 4,
          POPUP_WIDTH, POPUP_HEIGHT,
        );

        const popup = createPopupWindow({ width: POPUP_WIDTH, height: POPUP_HEIGHT, x, y, ...(glass ? { glassmorphism: glass } : {}) });
        wirePopupLifecycle(popup, { registry: addNodeMenuPopups, parentWindowId, profileId, ctx });

        const pageUrl = new URL('vela://add-node-menu');
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        pageUrl.searchParams.set('workspaceId', workspaceId);
        if (parentId) pageUrl.searchParams.set('parentId', parentId);
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await popup.loadURL(pageUrl.toString());
        popup.show();

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ADD_NODE_MENU_OPEN);
      }
    },
  );

  // ── add-node-menu:action ──────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.ADD_NODE_MENU_ACTION,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ADD_NODE_MENU_ACTION);
        const { windowId, action, workspaceId, parentId } = payload as {
          windowId: number;
          action: 'new-tab' | 'new-folder' | 'new-secure-tab' | 'new-blinded-window';
          workspaceId: string;
          parentId: string | null;
        };

        const popup = addNodeMenuPopups.get(windowId);
        if (popup && !popup.isDestroyed()) popup.close();

        if (action === 'new-blinded-window') {
          await ctx.profileWindowManager.openBlindedWindow();
          return { ok: true, data: undefined };
        }

        const parentWin = BrowserWindow.fromId(windowId);
        if (parentWin && !parentWin.isDestroyed()) {
          parentWin.webContents.send(IPC_EVENTS.ADD_NODE_MENU_ACTION, { action, workspaceId, parentId });
        }

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ADD_NODE_MENU_ACTION);
      }
    },
  );

  // ── download-popup:open ───────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.DOWNLOAD_POPUP_OPEN,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DOWNLOAD_POPUP_OPEN);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId === null) return { ok: true, data: undefined };
        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin) return { ok: true, data: undefined };

        const existing = downloadPopups.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.close();
          return { ok: true, data: undefined };
        }

        const { anchorRect } = payload as {
          anchorRect: { left: number; bottom: number };
        };

        const { profileId, repos } = getFrameContext(event, ctx);
        const glass = readGlass(repos);
        const POPUP_WIDTH = 380;
        const MAX_HEIGHT = 460;

        // Create hidden at height=10 so content overflows → scrollHeight = actual content height.
        // documentElement.scrollHeight = max(viewport, content), so starting at height=10 ensures
        // scrollHeight correctly reports the real content height, not the initial window height.
        const popup = createPopupWindow({ width: POPUP_WIDTH, height: 10, x: 0, y: 0, ...(glass ? { glassmorphism: glass } : {}) });
        wirePopupLifecycle(popup, { registry: downloadPopups, parentWindowId, profileId, ctx });

        const pageUrl = new URL('vela://download-popup');
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await popup.loadURL(pageUrl.toString());

        // Double rAF ensures React has fully committed before measuring.
        // body { margin: 0 } is set in the page's index.html so no margin offset.
        const contentH = await popup.webContents.executeJavaScript(
          'new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(document.documentElement.scrollHeight))))',
        ) as number;
        const finalHeight = Math.min(MAX_HEIGHT, Math.max(160, Math.round(contentH)));

        const pos = parentWin.getPosition();
        const { x, y } = clampToDisplay(
          pos[0]! + Math.round(anchorRect.left),
          pos[1]! + Math.round(anchorRect.bottom) + 4,
          POPUP_WIDTH, finalHeight,
        );
        popup.setBounds({ x, y, width: POPUP_WIDTH, height: finalHeight });
        popup.show();

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DOWNLOAD_POPUP_OPEN);
      }
    },
  );

  // ── download-popup:close ──────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.DOWNLOAD_POPUP_CLOSE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.DOWNLOAD_POPUP_CLOSE);
        const { windowId } = payload as { windowId: number };
        const win = downloadPopups.get(windowId);
        if (win && !win.isDestroyed()) win.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DOWNLOAD_POPUP_CLOSE);
      }
    },
  );

  // ── tab-preview:show ─────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.TAB_PREVIEW_SHOW, async (event, payload): Promise<void> => {
    try {
      guardTrustedFrame(event, IPC_CHANNELS.TAB_PREVIEW_SHOW);
      const { windowId, tabId, profileId, title, url, anchorRect } = payload as {
        windowId: number;
        tabId: string;
        profileId: string;
        title: string;
        url: string;
        anchorRect: { right: number; top: number; bottom: number };
      };

      const parentWin = BrowserWindow.fromId(windowId);
      if (!parentWin || parentWin.isDestroyed()) return;

      const existing = tabPreviewPopups.get(windowId);
      if (existing && !existing.isDestroyed()) existing.close();

      const POPUP_WIDTH = 280;
      const POPUP_HEIGHT = 200;

      const pos = parentWin.getPosition();
      const tabMidY = (anchorRect.top + anchorRect.bottom) / 2;
      const { x, y } = clampToDisplay(
        pos[0]! + Math.round(anchorRect.right) + 8,
        pos[1]! + Math.round(tabMidY) - Math.round(POPUP_HEIGHT / 2),
        POPUP_WIDTH, POPUP_HEIGHT,
      );

      // Tab preview: transparent, non-focusable, child of parent window, shown inactive
      const popup = createPopupWindow({
        width: POPUP_WIDTH, height: POPUP_HEIGHT, x, y,
        transparent: true, focusable: false, parent: parentWin,
      });
      tabPreviewPopups.set(windowId, popup);

      const pageUrl = new URL('vela://tab-preview');
      pageUrl.searchParams.set('windowId', String(windowId));
      pageUrl.searchParams.set('tabId', tabId);
      pageUrl.searchParams.set('profileId', profileId);
      pageUrl.searchParams.set('title', title);
      pageUrl.searchParams.set('url', url);

      await popup.loadURL(pageUrl.toString());
      popup.showInactive();

      popup.on('closed', () => {
        if (tabPreviewPopups.get(windowId) === popup) {
          tabPreviewPopups.delete(windowId);
        }
      });
    } catch {
      // ignore
    }
  });

  // ── tab-preview:update ───────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.TAB_PREVIEW_UPDATE, async (event, payload): Promise<void> => {
    try {
      guardTrustedFrame(event, IPC_CHANNELS.TAB_PREVIEW_UPDATE);
      const { windowId, tabId, profileId, title, url } = payload as {
        windowId: number;
        tabId: string;
        profileId: string;
        title: string;
        url: string;
      };

      const popup = tabPreviewPopups.get(windowId);
      if (!popup || popup.isDestroyed()) return;

      popup.webContents.send(IPC_EVENTS.TAB_PREVIEW_DATA, { tabId, profileId, title, url });
    } catch {
      // ignore
    }
  });

  // ── tab-preview:hide ─────────────────────────────────────────────────────
  ipcMain.handle(IPC_CHANNELS.TAB_PREVIEW_HIDE, async (event, payload): Promise<void> => {
    try {
      guardTrustedFrame(event, IPC_CHANNELS.TAB_PREVIEW_HIDE);
      const { windowId } = payload as { windowId: number };
      const popup = tabPreviewPopups.get(windowId);
      if (popup && !popup.isDestroyed()) popup.close();
    } catch {
      // ignore
    }
  });

  // ── tools-cluster:open ────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.TOOLS_CLUSTER_OPEN,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.TOOLS_CLUSTER_OPEN);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId === null) return { ok: true, data: undefined };
        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin) return { ok: true, data: undefined };

        const existing = toolsClusterPopups.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.close();
          return { ok: true, data: undefined };
        }

        const { anchorRect, state } = payload as {
          anchorRect: { right: number; bottom: number };
          state: Record<string, unknown>;
        };

        const { profileId, repos } = getFrameContext(event, ctx);
        const glass = readGlass(repos);
        const POPUP_WIDTH = 240;
        const POPUP_HEIGHT = 300;

        const pos = parentWin.getPosition();
        const { x, y } = clampToDisplay(
          pos[0]! + Math.round(anchorRect.right) - POPUP_WIDTH,
          pos[1]! + Math.round(anchorRect.bottom) + 6,
          POPUP_WIDTH, POPUP_HEIGHT,
        );

        const popup = createPopupWindow({ width: POPUP_WIDTH, height: POPUP_HEIGHT, x: Math.max(8, x), y, ...(glass ? { glassmorphism: glass } : {}) });
        wirePopupLifecycle(popup, { registry: toolsClusterPopups, parentWindowId, profileId, ctx });

        const pageUrl = new URL('vela://tools-cluster');
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        pageUrl.searchParams.set('state', JSON.stringify(state));
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await popup.loadURL(pageUrl.toString());
        popup.show();

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TOOLS_CLUSTER_OPEN);
      }
    },
  );

  // ── tools-cluster:close ───────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.TOOLS_CLUSTER_CLOSE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.TOOLS_CLUSTER_CLOSE);
        const { windowId } = payload as { windowId: number };
        const popup = toolsClusterPopups.get(windowId);
        if (popup && !popup.isDestroyed()) popup.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TOOLS_CLUSTER_CLOSE);
      }
    },
  );

  // ── status-cluster:open ───────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.STATUS_CLUSTER_OPEN,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.STATUS_CLUSTER_OPEN);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId === null) return { ok: true, data: undefined };
        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin) return { ok: true, data: undefined };

        const existing = statusClusterPopups.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.close();
          return { ok: true, data: undefined };
        }

        const { anchorRect, state } = payload as {
          anchorRect: { right: number; bottom: number };
          state: Record<string, unknown>;
        };

        const { profileId, repos } = getFrameContext(event, ctx);
        const glass = readGlass(repos);
        const POPUP_WIDTH = 260;
        const POPUP_HEIGHT = 320;

        const pos = parentWin.getPosition();
        const { x, y } = clampToDisplay(
          pos[0]! + Math.round(anchorRect.right) - POPUP_WIDTH,
          pos[1]! + Math.round(anchorRect.bottom) + 6,
          POPUP_WIDTH, POPUP_HEIGHT,
        );

        const popup = createPopupWindow({ width: POPUP_WIDTH, height: POPUP_HEIGHT, x: Math.max(8, x), y, ...(glass ? { glassmorphism: glass } : {}) });
        wirePopupLifecycle(popup, { registry: statusClusterPopups, parentWindowId, profileId, ctx });

        const pageUrl = new URL('vela://status-cluster');
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        pageUrl.searchParams.set('state', JSON.stringify(state));
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await popup.loadURL(pageUrl.toString());
        popup.show();

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.STATUS_CLUSTER_OPEN);
      }
    },
  );

  // ── status-cluster:close ──────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.STATUS_CLUSTER_CLOSE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.STATUS_CLUSTER_CLOSE);
        const { windowId } = payload as { windowId: number };
        const popup = statusClusterPopups.get(windowId);
        if (popup && !popup.isDestroyed()) popup.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.STATUS_CLUSTER_CLOSE);
      }
    },
  );

  // ── cluster:relay-action ──────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.CLUSTER_RELAY_ACTION,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.CLUSTER_RELAY_ACTION);
        const { windowId, action, clusterType, payload: actionPayload } = payload as {
          windowId: number;
          action: string;
          clusterType: 'tools' | 'status';
          payload?: Record<string, unknown>;
        };

        const map = clusterType === 'tools' ? toolsClusterPopups : statusClusterPopups;
        const popup = map.get(windowId);
        if (popup && !popup.isDestroyed()) popup.close();

        const parentWin = BrowserWindow.fromId(windowId);
        if (parentWin && !parentWin.isDestroyed()) {
          parentWin.webContents.send(IPC_EVENTS.CLUSTER_RELAY, {
            action,
            payload: actionPayload ?? {},
          });
        }

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.CLUSTER_RELAY_ACTION);
      }
    },
  );

  // ── notification-permission:open-popup ────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATION_PERMISSION_OPEN_POPUP,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.NOTIFICATION_PERMISSION_OPEN_POPUP);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId === null) return { ok: true, data: undefined };
        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin) return { ok: true, data: undefined };

        const existing = notificationPermissionPopups.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.close();
          return { ok: true, data: undefined };
        }

        const { origin, hasPushRequest, anchorRect } = payload as {
          origin: string;
          hasPushRequest: boolean;
          anchorRect: { left: number; bottom: number };
        };

        const { profileId, repos } = getFrameContext(event, ctx);
        const glass = readGlass(repos);
        const POPUP_WIDTH = 300;
        const POPUP_HEIGHT = hasPushRequest ? 176 : 130;

        const pos = parentWin.getPosition();
        const { x, y } = clampToDisplay(
          pos[0]! + Math.round(anchorRect.left),
          pos[1]! + Math.round(anchorRect.bottom) + 4,
          POPUP_WIDTH, POPUP_HEIGHT,
        );

        const popup = createPopupWindow({ width: POPUP_WIDTH, height: POPUP_HEIGHT, x, y, ...(glass ? { glassmorphism: glass } : {}) });
        wirePopupLifecycle(popup, {
          registry: notificationPermissionPopups,
          parentWindowId,
          profileId,
          ctx,
        });

        const pageUrl = new URL('vela://notification-permission');
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        pageUrl.searchParams.set('origin', origin);
        pageUrl.searchParams.set('hasPushRequest', String(hasPushRequest));
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await popup.loadURL(pageUrl.toString());
        popup.show();

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTIFICATION_PERMISSION_OPEN_POPUP);
      }
    },
  );

  // ── notification-permission:close-popup ───────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATION_PERMISSION_CLOSE_POPUP,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.NOTIFICATION_PERMISSION_CLOSE_POPUP);
        const { windowId } = payload as { windowId: number };
        const popup = notificationPermissionPopups.get(windowId);
        if (popup && !popup.isDestroyed()) popup.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTIFICATION_PERMISSION_CLOSE_POPUP);
      }
    },
  );
}

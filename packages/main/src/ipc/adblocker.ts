import path from 'node:path';
import fs from 'node:fs';
import { ipcMain, BrowserWindow, screen } from 'electron';
import {
  IPC_CHANNELS,
  type IpcResponse,
  type AdBlockerCounts,
} from '@vela/shared';
import type { IpcContext } from './context';
import { getFrameContext, resolveWindowId } from './helpers';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';
import { applyGlassUrlParams, applyNativeMaterial, type GlassParams } from './popupUtils';

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

const PANEL_WIDTH = 360;
const PANEL_HEIGHT_MAX = 480;
const INTERNAL_PRELOAD_PATH = path.join(__dirname, '../../preload/dist/index.js');

const activePanelWindows = new Map<number, BrowserWindow>();

export function registerAdBlockerHandlers(ctx: IpcContext): void {
  // ── adblocker:get-status ────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.ADBLOCKER_GET_STATUS,
    async (event, payload): Promise<IpcResponse<{
      globalEnabled: boolean;
      isException: boolean;
      domain: string | null;
      counts: AdBlockerCounts;
      lastUpdated: number | null;
    }>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ADBLOCKER_GET_STATUS);
        const { profileId } = getFrameContext(event, ctx);
        const { tabId } = payload as { tabId: string };

        const wcv = ctx.tabManager.getWcvForTab(tabId);
        const rawUrl = wcv?.webContents.getURL() ?? '';
        let domain: string | null = null;
        try {
          domain = rawUrl ? new URL(rawUrl).hostname : null;
        } catch { /* ignore */ }

        const globalEnabled = ctx.adBlockerManager.isEnabled(profileId);
        const isException = domain ? ctx.adBlockerManager.isException(profileId, domain) : false;
        const counts = ctx.adBlockerManager.getCountsForTab(tabId);
        const lastUpdated = ctx.adBlockerManager.getLastUpdated(profileId);

        return { ok: true, data: { globalEnabled, isException, domain, counts, lastUpdated } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ADBLOCKER_GET_STATUS);
      }
    },
  );

  // ── adblocker:toggle-site ───────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.ADBLOCKER_TOGGLE_SITE,
    async (event, payload): Promise<IpcResponse<{ isException: boolean }>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ADBLOCKER_TOGGLE_SITE);
        const { profileId } = getFrameContext(event, ctx);
        const { domain } = payload as { domain: string };

        const isCurrentlyException = ctx.adBlockerManager.isException(profileId, domain);
        if (isCurrentlyException) {
          await ctx.adBlockerManager.removeException(profileId, domain);
        } else {
          await ctx.adBlockerManager.addException(profileId, domain);
        }

        return { ok: true, data: { isException: !isCurrentlyException } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ADBLOCKER_TOGGLE_SITE);
      }
    },
  );

  // ── adblocker:reload-tab ────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.ADBLOCKER_RELOAD_TAB,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ADBLOCKER_RELOAD_TAB);
        const { tabId } = payload as { tabId: string };
        const wcv = ctx.tabManager.getWcvForTab(tabId);
        if (wcv) {
          ctx.adBlockerManager.resetCountsForTab(tabId);
          wcv.webContents.reload();
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ADBLOCKER_RELOAD_TAB);
      }
    },
  );

  // ── adblocker:list-exceptions ───────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.ADBLOCKER_LIST_EXCEPTIONS,
    async (event): Promise<IpcResponse<string[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ADBLOCKER_LIST_EXCEPTIONS);
        const { profileId } = getFrameContext(event, ctx);
        return { ok: true, data: ctx.adBlockerManager.listExceptions(profileId) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ADBLOCKER_LIST_EXCEPTIONS);
      }
    },
  );

  // ── adblocker:remove-exception ──────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.ADBLOCKER_REMOVE_EXCEPTION,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ADBLOCKER_REMOVE_EXCEPTION);
        const { profileId } = getFrameContext(event, ctx);
        const { domain } = payload as { domain: string };
        await ctx.adBlockerManager.removeException(profileId, domain);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ADBLOCKER_REMOVE_EXCEPTION);
      }
    },
  );

  // ── adblocker:update-lists ──────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.ADBLOCKER_UPDATE_LISTS,
    async (event): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ADBLOCKER_UPDATE_LISTS);
        const { profileId } = getFrameContext(event, ctx);
        await ctx.adBlockerManager.forceUpdateLists(profileId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ADBLOCKER_UPDATE_LISTS);
      }
    },
  );

  // ── adblocker:open-panel ────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.ADBLOCKER_OPEN_PANEL,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ADBLOCKER_OPEN_PANEL);
        const { profileId, repos } = getFrameContext(event, ctx);
        const glass = readGlass(repos);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId === null) return { ok: true, data: undefined };

        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin) return { ok: true, data: undefined };

        // Toggle: close if already open
        const existing = activePanelWindows.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.close();
          return { ok: true, data: undefined };
        }

        const { tabId, anchorRect } = payload as {
          tabId: string;
          anchorRect: { right: number; bottom: number };
        };

        const pos = parentWin.getPosition();
        const winX = pos[0] ?? 0;
        const winY = pos[1] ?? 0;
        let x = winX + Math.round(anchorRect.right) - PANEL_WIDTH;
        let y = winY + Math.round(anchorRect.bottom) + 6;

        const display = screen.getDisplayNearestPoint({ x, y });
        const { bounds } = display;
        x = Math.max(bounds.x + 4, Math.min(x, bounds.x + bounds.width - PANEL_WIDTH - 4));
        y = Math.max(bounds.y + 4, Math.min(y, bounds.y + bounds.height - PANEL_HEIGHT_MAX - 4));

        const preloadPath = fs.existsSync(INTERNAL_PRELOAD_PATH) ? INTERNAL_PRELOAD_PATH : undefined;

        const panelWin = new BrowserWindow({
          width: PANEL_WIDTH,
          height: PANEL_HEIGHT_MAX,
          x,
          y,
          frame: false,
          resizable: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          show: false,
          roundedCorners: true,
          backgroundColor: glass ? '#00000000' : '#1c1f26',
          ...(glass ? { transparent: true } : {}),
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
            ...(preloadPath ? { preload: preloadPath } : {}),
          },
        });

        if (glass) applyNativeMaterial(panelWin);

        activePanelWindows.set(parentWindowId, panelWin);
        ctx.profileWindowManager.registerAuxiliaryWindow(panelWin.id, profileId);

        const pageUrl = new URL('vela://adblocker-panel');
        pageUrl.searchParams.set('tabId', tabId);
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await panelWin.loadURL(pageUrl.toString());
        panelWin.show();

        panelWin.on('blur', () => {
          if (!panelWin.isDestroyed()) panelWin.close();
        });

        panelWin.on('closed', () => {
          ctx.profileWindowManager.unregisterAuxiliaryWindow(panelWin.id);
          if (activePanelWindows.get(parentWindowId) === panelWin) {
            activePanelWindows.delete(parentWindowId);
          }
        });

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ADBLOCKER_OPEN_PANEL);
      }
    },
  );

  // ── adblocker:close-panel ───────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.ADBLOCKER_CLOSE_PANEL,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ADBLOCKER_CLOSE_PANEL);
        const { windowId } = payload as { windowId: number };
        const win = activePanelWindows.get(windowId);
        if (win && !win.isDestroyed()) win.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ADBLOCKER_CLOSE_PANEL);
      }
    },
  );
}

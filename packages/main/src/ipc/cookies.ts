import path from 'node:path';
import fs from 'node:fs';
import { ipcMain, BrowserWindow, screen, type Cookie } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  type IpcResponse,
  cookieGetForUrlSchema,
  cookieSetSchema,
  cookieRemoveSchema,
  cookieRemoveAllForDomainSchema,
} from '@vela/shared';
import type { IpcContext } from './context';
import { getFrameContext, resolveWindowId } from './helpers';
import { mapError } from './errors';
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
import { guardTrustedFrame } from './validate';

const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 520;
const INTERNAL_PRELOAD_PATH = path.join(__dirname, '../../preload/dist/index.js');
const activePanelWindows = new Map<number, BrowserWindow>();

const attachedProfiles = new Set<string>();

function attachCookieChangeListener(profileId: string, ctx: IpcContext): void {
  if (attachedProfiles.has(profileId)) return;
  attachedProfiles.add(profileId);

  let sess: ReturnType<typeof ctx.profileManager.getSession>;
  try {
    sess = ctx.profileManager.getSession(profileId);
  } catch {
    return;
  }

  sess.cookies.on('changed', (_event, cookie) => {
    const windowIds = ctx.profileWindowManager.getWindowsForProfile(profileId);
    for (const windowId of windowIds) {
      const win = BrowserWindow.fromId(windowId);
      if (!win) continue;

      const activeTabId = ctx.tabManager.getActiveTabId(windowId);
      if (!activeTabId) continue;

      const wcv = ctx.tabManager.getWcvForTab(activeTabId);
      const wc = wcv?.webContents;
      const activeUrl = wc && !wc.isDestroyed() ? wc.getURL() : undefined;
      if (!activeUrl) continue;

      let activeHostname: string;
      try {
        activeHostname = new URL(activeUrl).hostname;
      } catch {
        continue;
      }

      const rawDomain = cookie.domain ?? '';
      const cookieDomain = rawDomain.startsWith('.') ? rawDomain.slice(1) : rawDomain;
      if (!cookieDomain) continue;

      if (activeHostname.endsWith(cookieDomain) || cookieDomain.endsWith(activeHostname)) {
        win.webContents.send(IPC_EVENTS.COOKIES_CHANGED, {
          tabId: activeTabId,
          domain: cookie.domain,
        });
      }
    }
  });
}

export function registerCookieHandlers(ctx: IpcContext): void {
  ctx.events.on(IPC_EVENTS.PROFILE_UNLOCKED, ({ profileId }) => {
    attachCookieChangeListener(profileId, ctx);
  });

  // ── cookies:get-for-url ─────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.COOKIES_GET_FOR_URL,
    async (event, payload): Promise<IpcResponse<Cookie[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.COOKIES_GET_FOR_URL);
        const { profileId } = getFrameContext(event, ctx);
        const { url } = cookieGetForUrlSchema.parse(payload);
        const sess = ctx.profileManager.getSession(profileId);
        const cookies = await sess.cookies.get({ url });
        return { ok: true, data: cookies };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.COOKIES_GET_FOR_URL);
      }
    },
  );

  // ── cookies:set ─────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.COOKIES_SET,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.COOKIES_SET);
        const { profileId } = getFrameContext(event, ctx);
        const data = cookieSetSchema.parse(payload);
        const sess = ctx.profileManager.getSession(profileId);
        await sess.cookies.set(data);
        return { ok: true, data: undefined };
      } catch (err) {
        // session.cookies.set can throw with a descriptive human message
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: 'INTERNAL', details: msg };
      }
    },
  );

  // ── cookies:remove ──────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.COOKIES_REMOVE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.COOKIES_REMOVE);
        const { profileId } = getFrameContext(event, ctx);
        const { url, name } = cookieRemoveSchema.parse(payload);
        const sess = ctx.profileManager.getSession(profileId);
        await sess.cookies.remove(url, name);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.COOKIES_REMOVE);
      }
    },
  );

  // ── cookies:remove-all-for-domain ───────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.COOKIES_REMOVE_ALL_FOR_DOMAIN,
    async (event, payload): Promise<IpcResponse<{ removed: number }>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.COOKIES_REMOVE_ALL_FOR_DOMAIN);
        const { profileId } = getFrameContext(event, ctx);
        const { domain } = cookieRemoveAllForDomainSchema.parse(payload);
        const sess = ctx.profileManager.getSession(profileId);
        const all = await sess.cookies.get({ domain });
        let removed = 0;
        for (const cookie of all) {
          const scheme = cookie.secure ? 'https' : 'http';
          const rawDomain = cookie.domain ?? domain;
          const cookieDomain = rawDomain.startsWith('.') ? rawDomain.slice(1) : rawDomain;
          const cookieUrl = `${scheme}://${cookieDomain}${cookie.path ?? '/'}`;
          await sess.cookies.remove(cookieUrl, cookie.name);
          removed++;
        }
        return { ok: true, data: { removed } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.COOKIES_REMOVE_ALL_FOR_DOMAIN);
      }
    },
  );

  // ── cookies:clear-all ───────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.COOKIES_CLEAR_ALL,
    async (event): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.COOKIES_CLEAR_ALL);
        const { profileId } = getFrameContext(event, ctx);
        const sess = ctx.profileManager.getSession(profileId);
        await sess.clearStorageData({ storages: ['cookies'] });
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.COOKIES_CLEAR_ALL);
      }
    },
  );

  // ── cookies:open-panel ──────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.COOKIES_OPEN_PANEL,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.COOKIES_OPEN_PANEL);
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

        const { url, anchorRect } = payload as {
          url: string;
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
        y = Math.max(bounds.y + 4, Math.min(y, bounds.y + bounds.height - PANEL_HEIGHT - 4));

        const preloadPath = fs.existsSync(INTERNAL_PRELOAD_PATH) ? INTERNAL_PRELOAD_PATH : undefined;

        const panelWin = new BrowserWindow({
          width: PANEL_WIDTH,
          height: PANEL_HEIGHT,
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

        const pageUrl = new URL('vela://cookiepanel');
        pageUrl.searchParams.set('url', url);
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
        return mapError(err, IPC_CHANNELS.COOKIES_OPEN_PANEL);
      }
    },
  );

  // ── cookies:close-panel ─────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.COOKIES_CLOSE_PANEL,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.COOKIES_CLOSE_PANEL);
        const { windowId } = payload as { windowId: number };
        const win = activePanelWindows.get(windowId);
        if (win && !win.isDestroyed()) win.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.COOKIES_CLOSE_PANEL);
      }
    },
  );
}

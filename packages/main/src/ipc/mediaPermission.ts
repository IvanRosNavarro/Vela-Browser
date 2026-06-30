import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { guardTrustedFrame } from './validate';
import { getFrameContext, resolveWindowId } from './helpers';
import { mapError } from './errors';
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

const mediaPermissionPopups = new Map<number, BrowserWindow>();

export function registerMediaPermissionHandlers(ctx: IpcContext): void {
  const mm = ctx.mediaPermissionManager;

  // ── media-permission:grant ────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.MEDIA_PERMISSION_GRANT,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.MEDIA_PERMISSION_GRANT);
        const { profileId } = getFrameContext(event, ctx);
        const { origin } = payload as { origin: string };
        mm.grantPermission(origin, profileId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MEDIA_PERMISSION_GRANT);
      }
    },
  );

  // ── media-permission:deny ─────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.MEDIA_PERMISSION_DENY,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.MEDIA_PERMISSION_DENY);
        const { profileId } = getFrameContext(event, ctx);
        const { origin } = payload as { origin: string };
        mm.denyPermission(origin, profileId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MEDIA_PERMISSION_DENY);
      }
    },
  );

  // ── media-permission:revoke ───────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.MEDIA_PERMISSION_REVOKE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.MEDIA_PERMISSION_REVOKE);
        const { profileId } = getFrameContext(event, ctx);
        const { origin } = payload as { origin: string };
        mm.revokePermission(origin, profileId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MEDIA_PERMISSION_REVOKE);
      }
    },
  );

  // ── media-permission:get-all ──────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.MEDIA_PERMISSION_GET_ALL,
    async (event): Promise<IpcResponse<unknown[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.MEDIA_PERMISSION_GET_ALL);
        const { profileId } = getFrameContext(event, ctx);
        return { ok: true, data: mm.getAllPermissions(profileId) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MEDIA_PERMISSION_GET_ALL);
      }
    },
  );

  // ── media-permission:open-popup ───────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.MEDIA_PERMISSION_OPEN_POPUP,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.MEDIA_PERMISSION_OPEN_POPUP);
        const parentWindowId = resolveWindowId(event);
        if (parentWindowId === null) return { ok: true, data: undefined };
        const parentWin = BrowserWindow.fromId(parentWindowId);
        if (!parentWin) return { ok: true, data: undefined };

        const existing = mediaPermissionPopups.get(parentWindowId);
        if (existing && !existing.isDestroyed()) {
          existing.close();
          return { ok: true, data: undefined };
        }

        const { origin, mediaTypes, anchorRect } = payload as {
          origin: string;
          mediaTypes: Array<'video' | 'audio'>;
          anchorRect: { left: number; bottom: number };
        };

        const { profileId, repos } = getFrameContext(event, ctx);
        const glass = readGlass(repos);
        const POPUP_WIDTH = 300;
        const POPUP_HEIGHT = 130;

        const pos = parentWin.getPosition();
        const { x, y } = clampToDisplay(
          pos[0]! + Math.round(anchorRect.left),
          pos[1]! + Math.round(anchorRect.bottom) + 4,
          POPUP_WIDTH, POPUP_HEIGHT,
        );

        const popup = createPopupWindow({ width: POPUP_WIDTH, height: POPUP_HEIGHT, x, y, ...(glass ? { glassmorphism: glass } : {}) });
        wirePopupLifecycle(popup, {
          registry: mediaPermissionPopups,
          parentWindowId,
          profileId,
          ctx,
        });

        const pageUrl = new URL('vela://media-permission-popup');
        pageUrl.searchParams.set('windowId', String(parentWindowId));
        pageUrl.searchParams.set('origin', origin);
        pageUrl.searchParams.set('mediaTypes', mediaTypes.join(','));
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await popup.loadURL(pageUrl.toString());
        popup.show();

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MEDIA_PERMISSION_OPEN_POPUP);
      }
    },
  );

  // ── media-permission:close-popup ──────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.MEDIA_PERMISSION_CLOSE_POPUP,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.MEDIA_PERMISSION_CLOSE_POPUP);
        const { windowId } = payload as { windowId: number };
        const popup = mediaPermissionPopups.get(windowId);
        if (popup && !popup.isDestroyed()) popup.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MEDIA_PERMISSION_CLOSE_POPUP);
      }
    },
  );
}

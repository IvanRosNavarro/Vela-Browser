import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS } from '@vela/shared';
import type { IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { guardTrustedFrame } from './validate';
import { getFrameContext, resolveWindowId } from './helpers';
import { mapError } from './errors';

export function registerNotificationHandlers(ctx: IpcContext): void {
  const nm = ctx.notificationManager;
  const psm = ctx.pushSubscriptionManager;
  const ppm = ctx.pushProxyManager;

  // ── notifications:get-all ──────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_GET_ALL,
    async (event): Promise<IpcResponse<unknown[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.NOTIFICATIONS_GET_ALL);
        const { profileId } = getFrameContext(event, ctx);
        return { ok: true, data: nm.getNotifications(profileId) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTIFICATIONS_GET_ALL);
      }
    },
  );

  // ── notifications:get-unread-count ────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_GET_UNREAD_COUNT,
    async (event): Promise<IpcResponse<number>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.NOTIFICATIONS_GET_UNREAD_COUNT);
        const { profileId } = getFrameContext(event, ctx);
        return { ok: true, data: nm.getUnreadCount(profileId) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTIFICATIONS_GET_UNREAD_COUNT);
      }
    },
  );

  // ── notifications:mark-read ───────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_MARK_READ,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.NOTIFICATIONS_MARK_READ);
        const { profileId } = getFrameContext(event, ctx);
        const { id } = payload as { id: string };
        nm.markAsRead(id, profileId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTIFICATIONS_MARK_READ);
      }
    },
  );

  // ── notifications:mark-all-read ───────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_MARK_ALL_READ,
    async (event): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.NOTIFICATIONS_MARK_ALL_READ);
        const { profileId } = getFrameContext(event, ctx);
        nm.markAllAsRead(profileId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTIFICATIONS_MARK_ALL_READ);
      }
    },
  );

  // ── notifications:delete ──────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_DELETE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.NOTIFICATIONS_DELETE);
        const { profileId } = getFrameContext(event, ctx);
        const { id } = payload as { id: string };
        nm.deleteNotification(id, profileId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTIFICATIONS_DELETE);
      }
    },
  );

  // ── notifications:clear-all ───────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_CLEAR_ALL,
    async (event): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.NOTIFICATIONS_CLEAR_ALL);
        const { profileId } = getFrameContext(event, ctx);
        nm.clearAll(profileId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTIFICATIONS_CLEAR_ALL);
      }
    },
  );

  // ── notifications:grant-permission ───────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_GRANT_PERMISSION,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.NOTIFICATIONS_GRANT_PERMISSION);
        const { profileId, windowId } = getFrameContext(event, ctx);
        const { origin, withPush } = payload as { origin: string; withPush?: boolean };

        nm.grantPermission(origin, profileId, { withPush });

        // Aplicar override en Chromium para que el sitio vea el permiso en futuros checks
        try {
          const ses = ctx.profileManager.getSession(profileId);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (ses as any).setPermissionOverridesForOrigin?.(origin, { notifications: 'granted' });
        } catch { /* perfil puede no tener sesión activa */ }

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTIFICATIONS_GRANT_PERMISSION);
      }
    },
  );

  // ── notifications:deny-permission ────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_DENY_PERMISSION,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.NOTIFICATIONS_DENY_PERMISSION);
        const { profileId } = getFrameContext(event, ctx);
        const { origin } = payload as { origin: string };
        nm.denyPermission(origin, profileId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTIFICATIONS_DENY_PERMISSION);
      }
    },
  );

  // ── notifications:get-permission ─────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_GET_PERMISSION,
    async (event, payload): Promise<IpcResponse<string>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.NOTIFICATIONS_GET_PERMISSION);
        const { profileId } = getFrameContext(event, ctx);
        const { origin } = payload as { origin: string };
        const state = nm.getPermissionState(origin, profileId);
        return { ok: true, data: state };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTIFICATIONS_GET_PERMISSION);
      }
    },
  );

  // ── notifications:get-all-permissions ────────────────────────────────────
  ipcMain.handle(
    'notifications:get-all-permissions',
    async (event): Promise<IpcResponse<unknown[]>> => {
      try {
        guardTrustedFrame(event, 'notifications:get-all-permissions');
        const { profileId } = getFrameContext(event, ctx);
        return { ok: true, data: nm.getAllPermissions(profileId) };
      } catch (err) {
        return mapError(err, 'notifications:get-all-permissions');
      }
    },
  );

  // ── notifications:revoke-permission ──────────────────────────────────────
  ipcMain.handle(
    'notifications:revoke-permission',
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, 'notifications:revoke-permission');
        const { profileId, windowId } = getFrameContext(event, ctx);
        const { origin } = payload as { origin: string };
        nm.revokePermission(origin, profileId);

        // Quitar el override de Chromium
        try {
          const ses = ctx.profileManager.getSession(profileId);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (ses as any).setPermissionOverridesForOrigin?.(origin, { notifications: 'default' });
        } catch { /* perfil puede no tener sesión activa */ }

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, 'notifications:revoke-permission');
      }
    },
  );

  // ── notifications:get-silence-rules ──────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_GET_SILENCE_RULES,
    async (event): Promise<IpcResponse<unknown[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.NOTIFICATIONS_GET_SILENCE_RULES);
        const { profileId } = getFrameContext(event, ctx);
        return { ok: true, data: nm.getSilenceRules(profileId) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTIFICATIONS_GET_SILENCE_RULES);
      }
    },
  );

  // ── notifications:set-silence-rules ──────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_SET_SILENCE_RULES,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.NOTIFICATIONS_SET_SILENCE_RULES);
        const { profileId } = getFrameContext(event, ctx);
        const { rules } = payload as { rules: unknown[] };
        nm.setSilenceRules(profileId, rules as import('@vela/shared').SilenceRule[]);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTIFICATIONS_SET_SILENCE_RULES);
      }
    },
  );

  // ── push:list-subscriptions ───────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.PUSH_LIST_SUBSCRIPTIONS,
    async (event): Promise<IpcResponse<unknown[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.PUSH_LIST_SUBSCRIPTIONS);
        const { profileId } = getFrameContext(event, ctx);
        const subs = psm.listByProfile(profileId).map((s) => ({
          id: s.id,
          origin: s.origin,
          endpoint: s.endpoint,
          createdAt: s.createdAt,
          lastPushAt: s.lastPushAt,
        }));
        return { ok: true, data: subs };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PUSH_LIST_SUBSCRIPTIONS);
      }
    },
  );

  // ── push:unsubscribe ──────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.PUSH_UNSUBSCRIBE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.PUSH_UNSUBSCRIBE);
        const { profileId } = getFrameContext(event, ctx);
        const { origin } = payload as { origin: string };
        psm.unsubscribe(profileId, origin);
        nm.revokePermission(origin, profileId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PUSH_UNSUBSCRIBE);
      }
    },
  );

  // ── push:unsubscribe-all ──────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.PUSH_UNSUBSCRIBE_ALL,
    async (event): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.PUSH_UNSUBSCRIBE_ALL);
        const { profileId } = getFrameContext(event, ctx);
        psm.unsubscribeAll(profileId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PUSH_UNSUBSCRIBE_ALL);
      }
    },
  );

  // ── notifications:open-center ────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.NOTIFICATIONS_OPEN_CENTER,
    async (event): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.NOTIFICATIONS_OPEN_CENTER);
        const { windowId } = getFrameContext(event, ctx);
        const win = BrowserWindow.fromId(windowId);
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_EVENTS.NOTIFICATION_CENTER_OPEN, {});
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTIFICATIONS_OPEN_CENTER);
      }
    },
  );

  // ── push:get-proxy-subscription ──────────────────────────────────────────
  // Called from webTab.ts preload (web content context, NOT the shell).
  // We do NOT use guardTrustedFrame here — the sender is the website's frame.
  // Profile is resolved from the window that owns this WebContentsView.
  ipcMain.handle(
    IPC_CHANNELS.PUSH_GET_PROXY_SUBSCRIPTION,
    async (event, payload): Promise<IpcResponse<unknown>> => {
      try {
        // El origen se DERIVA del frame emisor, nunca del payload: si lo
        // tomáramos del payload, una página podría suscribirse a / consultar el
        // canal push de otro origen (spoofing). payload.origin se ignora.
        const senderUrl = event.senderFrame?.url ?? '';
        let origin: string;
        try {
          const u = new URL(senderUrl);
          if (u.protocol !== 'https:' && u.protocol !== 'http:') {
            return { ok: true, data: null };
          }
          origin = u.origin;
        } catch {
          return { ok: true, data: null };
        }

        // Resolve window from the sender's WebContents (works for WCV tabs)
        const windowId = resolveWindowId(event);
        if (windowId === null) return { ok: true, data: null };
        const profileId = ctx.profileWindowManager.getProfileForWindow(windowId);
        if (!profileId) return { ok: true, data: null };

        // Get session token from the active SyncManager (not from settings —
        // the token may not be persisted yet for users who set up sync before
        // the push proxy deploy).
        const syncManager = ctx.syncManagers.get(profileId);
        const sessionToken = syncManager?.getSessionToken() ?? null;
        ctx.logger.info(`[push-proxy] getOrCreate origin=${origin} hasSyncToken=${!!sessionToken}`);
        if (!sessionToken) return { ok: true, data: null };

        const sub = await ppm.getOrCreate(profileId, origin, sessionToken);
        ctx.logger.info(`[push-proxy] subscription created endpoint=${sub?.endpoint}`);
        return { ok: true, data: sub };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PUSH_GET_PROXY_SUBSCRIPTION);
      }
    },
  );

  // ── push:get-subscription ────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.PUSH_GET_SUBSCRIPTION,
    async (event, payload): Promise<IpcResponse<unknown>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.PUSH_GET_SUBSCRIPTION);
        const { profileId } = getFrameContext(event, ctx);
        const { origin } = payload as { origin: string };
        const sub = psm.getByOrigin(profileId, origin);
        return {
          ok: true,
          data: sub
            ? { id: sub.id, origin: sub.origin, endpoint: sub.endpoint, createdAt: sub.createdAt, lastPushAt: sub.lastPushAt }
            : null,
        };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PUSH_GET_SUBSCRIPTION);
      }
    },
  );
}

import { BrowserWindow, Notification as ElectronNotification } from 'electron';
import { IPC_EVENTS } from '@vela/shared';
import type {
  NotificationPermissionState,
  SilenceRule,
  StoredNotification,
} from '@vela/shared';
import type { WebContents } from 'electron';
import type { MainEventBus } from '../ipc/events';
import type { Logger } from '../logger';
import type { ProfileManager } from '../profiles/ProfileManager';
import type { PushSubscriptionManager } from './PushSubscriptionManager';

interface StoredPermission {
  origin: string;
  state: 'granted' | 'denied';
  grantedAt?: number;
  deniedAt?: number;
}

interface PendingRequest {
  wcId: number;
  hasPushRequest: boolean;
  /** Callback de Electron que resuelve el Notification.requestPermission() de la página */
  callback?: (granted: boolean) => void;
}

const PERMISSIONS_KEY = 'notifications:permissions';
const SILENCE_RULES_KEY = 'notifications:silence-rules';

export interface NotificationManagerCtx {
  profileManager: ProfileManager;
  events: MainEventBus;
  logger: Logger;
  pushSubscriptionManager?: PushSubscriptionManager;
}

export class NotificationManager {
  /** origin → pending request info (limpiar cuando el usuario decide) */
  private readonly pendingRequests = new Map<string, PendingRequest>();

  constructor(private readonly ctx: NotificationManagerCtx) {}

  // ---------- pending requests (solicitudes en vuelo) ----------

  registerPendingRequest(
    wcId: number,
    origin: string,
    opts: { hasPushRequest: boolean; callback?: (granted: boolean) => void },
  ): void {
    const existing = this.pendingRequests.get(origin);
    // Si ya había una solicitud de notificaciones y ahora llega push, subir el flag
    const hasPushRequest = (existing?.hasPushRequest ?? false) || opts.hasPushRequest;
    // Conservar el callback previo si el nuevo no trae uno
    const callback = opts.callback ?? existing?.callback;
    this.pendingRequests.set(origin, { wcId, hasPushRequest, callback });

    const windowId = this.resolveWindowForWc(wcId) ?? 0;
    this.ctx.events.emit(IPC_EVENTS.NOTIFICATION_PERMISSION_PENDING, {
      origin,
      windowId,
      hasPushRequest,
    });
  }

  clearPendingRequest(origin: string): void {
    this.pendingRequests.delete(origin);
  }

  getPendingRequest(origin: string): PendingRequest | undefined {
    return this.pendingRequests.get(origin);
  }

  // ---------- permissions ----------

  grantPermission(
    origin: string,
    profileId: string,
    opts: { withPush?: boolean } = {},
  ): void {
    this.savePermission(profileId, { origin, state: 'granted', grantedAt: Date.now() });
    // Resolver el requestPermission() pendiente de la página
    const pending = this.pendingRequests.get(origin);
    try { pending?.callback?.(true); } catch { /* wc puede estar destruido */ }
    this.clearPendingRequest(origin);
    const newState = this.getPermissionState(origin, profileId);
    this.ctx.events.emit(IPC_EVENTS.NOTIFICATION_PERMISSION_CHANGED, {
      origin,
      state: opts.withPush ? 'push-active' : newState,
      windowId: this.resolveWindowForProfile(profileId) ?? 0,
    });
  }

  denyPermission(origin: string, profileId: string): void {
    this.savePermission(profileId, { origin, state: 'denied', deniedAt: Date.now() });
    const pending = this.pendingRequests.get(origin);
    try { pending?.callback?.(false); } catch { /* wc puede estar destruido */ }
    this.clearPendingRequest(origin);
    this.ctx.events.emit(IPC_EVENTS.NOTIFICATION_PERMISSION_CHANGED, {
      origin,
      state: 'denied',
      windowId: this.resolveWindowForProfile(profileId) ?? 0,
    });
  }

  revokePermission(origin: string, profileId: string): void {
    const perms = this.loadPermissions(profileId).filter((p) => p.origin !== origin);
    const repos = this.ctx.profileManager.getRepositories(profileId);
    repos.settings.set(PERMISSIONS_KEY, JSON.stringify(perms));
    this.ctx.events.emit(IPC_EVENTS.NOTIFICATION_PERMISSION_CHANGED, {
      origin,
      state: 'none',
      windowId: this.resolveWindowForProfile(profileId) ?? 0,
    });
  }

  getPermissionState(origin: string, profileId: string): NotificationPermissionState {
    const notifState = this.getNotifPermissionState(origin, profileId);
    if (notifState === 'granted' && this.ctx.pushSubscriptionManager) {
      const hasPush = this.ctx.pushSubscriptionManager.getByOrigin(profileId, origin) !== null;
      if (hasPush) return 'push-active';
    }
    if (this.pendingRequests.has(origin)) return 'pending';
    return notifState;
  }

  isGranted(origin: string, profileId: string): boolean {
    return this.getNotifPermissionState(origin, profileId) === 'granted';
  }

  isDenied(origin: string, profileId: string): boolean {
    return this.getNotifPermissionState(origin, profileId) === 'denied';
  }

  /** Devuelve todos los origins con permiso 'granted' para restaurar overrides al arrancar. */
  getGrantedOrigins(profileId: string): string[] {
    return this.loadPermissions(profileId)
      .filter((p) => p.state === 'granted')
      .map((p) => p.origin);
  }

  getAllPermissions(profileId: string): Array<{ origin: string; state: 'granted' | 'denied'; grantedAt?: number; deniedAt?: number }> {
    return this.loadPermissions(profileId);
  }

  // ---------- receive (notificación entrante desde did-create-notification) ----------

  receive(data: {
    title: string;
    body?: string;
    icon?: string;
    origin: string;
    source: 'web' | 'push';
    tabId?: string;
    profileId: string;
  }): void {
    // Silenciar orígenes sin permiso explícito.
    if (!this.isGranted(data.origin, data.profileId)) return;
    if (this.isSilenced(data.profileId)) return;

    const mode = this.getDisplayMode(data.profileId);

    const notification: StoredNotification = {
      id: crypto.randomUUID(),
      profileId: data.profileId,
      origin: data.origin,
      title: data.title,
      body: data.body ?? '',
      icon: data.icon ?? null,
      source: data.source,
      read: false,
      timestamp: Date.now(),
      tabId: data.tabId ?? null,
    };

    // Guardar en panel salvo que el usuario quiera solo SO
    if (mode !== 'os-only') {
      try {
        const repos = this.ctx.profileManager.getRepositories(data.profileId);
        repos.notifications.insert(notification);
      } catch (err) {
        this.ctx.logger.error('[notifications] fallo guardando notificación', err);
      }
      const count = this.getUnreadCount(data.profileId);
      this.ctx.events.emit(IPC_EVENTS.NOTIFICATIONS_CHANGED, {
        profileId: data.profileId,
        unreadCount: count,
      });
    }

    // Mostrar notificación del SO salvo que el usuario quiera solo panel
    if (mode !== 'panel-only' && !this.hasAnyFocusedWindow()) {
      this.showOsNotification(notification);
    }
  }

  private hasAnyFocusedWindow(): boolean {
    return BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isFocused());
  }

  private showOsNotification(notif: StoredNotification): void {
    if (!ElectronNotification.isSupported()) return;
    const shortOrigin = (() => {
      try { return new URL(notif.origin).hostname; } catch { return notif.origin; }
    })();
    const n = new ElectronNotification({
      title: notif.title,
      body: notif.body ? notif.body : shortOrigin,
      subtitle: notif.body ? shortOrigin : undefined,
      silent: false,
    });
    n.on('click', () => {
      // Traer la ventana de Vela al frente
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.focus();
      // Abrir el panel de notificaciones
      this.ctx.events.emit(IPC_EVENTS.NOTIFICATION_CENTER_OPEN, {});
    });
    n.show();
  }

  // ---------- captureAndStorePushSubscription ----------

  async captureAndStorePushSubscription(
    wc: WebContents,
    origin: string,
    profileId: string,
  ): Promise<void> {
    if (!this.ctx.pushSubscriptionManager) return;
    try {
      await this.ctx.pushSubscriptionManager.captureSubscription(wc, origin, profileId);
      // Actualizar estado del icono
      const windowId = this.resolveWindowForProfile(profileId) ?? 0;
      this.ctx.events.emit(IPC_EVENTS.NOTIFICATION_PERMISSION_CHANGED, {
        origin,
        state: 'push-active',
        windowId,
      });
    } catch (err) {
      this.ctx.logger.warn('[notifications] captureSubscription falló', err);
    }
  }

  // ---------- attachNotificationInterceptor ----------

  /**
   * Adjunta el interceptor de notificaciones web a un WebContents.
   * Debe llamarse cada vez que se crea un WCV de tab.
   */
  attachToWebContents(wc: WebContents, profileId: string): void {
    // Opción A: evento por webContents (más fiable en E42)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (wc as any).on('did-create-notification', (event: { preventDefault(): void }, notificationData: {
      title: string;
      body?: string;
      icon?: string;
    }) => {
      try {
        event.preventDefault();
        const origin = this.safeOrigin(wc.getURL());
        if (!origin) return;
        this.receive({
          title: notificationData.title,
          body: notificationData.body,
          icon: notificationData.icon,
          origin,
          source: 'web',
          profileId,
        });
      } catch (err) {
        this.ctx.logger.warn('[notifications] error en did-create-notification', err);
      }
    });
  }

  // ---------- silence rules ----------

  getSilenceRules(profileId: string): SilenceRule[] {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      const raw = repos.settings.get(SILENCE_RULES_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as SilenceRule[];
    } catch {
      return [];
    }
  }

  setSilenceRules(profileId: string, rules: SilenceRule[]): void {
    const repos = this.ctx.profileManager.getRepositories(profileId);
    repos.settings.set(SILENCE_RULES_KEY, JSON.stringify(rules));
  }

  isSilenced(profileId: string, workspaceId?: string | null): boolean {
    const rules = this.getSilenceRules(profileId);
    const now = Date.now();
    const timeStr = this.currentTimeString();
    for (const rule of rules) {
      if (rule.type === 'temporary' && now < rule.until) return true;
      if (rule.type === 'schedule' && this.inScheduleWindow(timeStr, rule.from, rule.to)) return true;
      if (rule.type === 'workspace' && workspaceId && rule.workspaceId === workspaceId) return true;
    }
    return false;
  }

  // ---------- stored notifications ----------

  storeNotification(data: Omit<StoredNotification, 'id' | 'read'>): StoredNotification {
    const id = crypto.randomUUID();
    const notification: StoredNotification = { ...data, id, read: false };
    try {
      const repos = this.ctx.profileManager.getRepositories(data.profileId);
      repos.notifications.insert(notification);
    } catch (err) {
      this.ctx.logger.error('[notifications] fallo guardando notificación', err);
    }
    const silenced = this.isSilenced(data.profileId);
    const count = this.getUnreadCount(data.profileId);
    this.ctx.events.emit(IPC_EVENTS.NOTIFICATIONS_CHANGED, {
      profileId: data.profileId,
      unreadCount: silenced ? -1 : count,
    });
    return notification;
  }

  getNotifications(profileId: string): StoredNotification[] {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      return repos.notifications.findAll().map((n) => ({ ...n, profileId }));
    } catch (err) {
      this.ctx.logger.error('[notifications] fallo leyendo notificaciones', err);
      return [];
    }
  }

  getUnreadCount(profileId: string): number {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      return repos.notifications.countUnread();
    } catch {
      return 0;
    }
  }

  markAsRead(id: string, profileId: string): void {
    const repos = this.ctx.profileManager.getRepositories(profileId);
    repos.notifications.markRead(id);
    this.emitChanged(profileId);
  }

  markAllAsRead(profileId: string): void {
    const repos = this.ctx.profileManager.getRepositories(profileId);
    repos.notifications.markAllRead();
    this.emitChanged(profileId);
  }

  deleteNotification(id: string, profileId: string): void {
    const repos = this.ctx.profileManager.getRepositories(profileId);
    repos.notifications.delete(id);
    this.emitChanged(profileId);
  }

  clearAll(profileId: string): void {
    const repos = this.ctx.profileManager.getRepositories(profileId);
    repos.notifications.clear();
    this.emitChanged(profileId);
  }

  // ---------- private ----------

  private getNotifPermissionState(
    origin: string,
    profileId: string,
  ): Exclude<NotificationPermissionState, 'push-active' | 'pending'> {
    const permissions = this.loadPermissions(profileId);
    const stored = permissions.find((p) => p.origin === origin);
    if (stored) return stored.state;
    return 'none';
  }

  private emitChanged(profileId: string): void {
    const count = this.getUnreadCount(profileId);
    this.ctx.events.emit(IPC_EVENTS.NOTIFICATIONS_CHANGED, { profileId, unreadCount: count });
  }

  private loadPermissions(profileId: string): StoredPermission[] {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      const raw = repos.settings.get(PERMISSIONS_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as StoredPermission[];
    } catch {
      return [];
    }
  }

  private savePermission(profileId: string, perm: StoredPermission): void {
    const perms = this.loadPermissions(profileId).filter((p) => p.origin !== perm.origin);
    perms.push(perm);
    const repos = this.ctx.profileManager.getRepositories(profileId);
    repos.settings.set(PERMISSIONS_KEY, JSON.stringify(perms));
  }

  private resolveWindowForProfile(_profileId: string): number | null {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) return win.id;
    }
    return null;
  }

  private resolveWindowForWc(wcId: number): number | null {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents.id === wcId) return win.id;
    }
    return null;
  }

  private safeOrigin(url: string): string | null {
    try {
      const u = new URL(url);
      if (!u.origin || u.origin === 'null') return null;
      return u.origin;
    } catch {
      return null;
    }
  }

  private currentTimeString(): string {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  }

  private getDisplayMode(profileId: string): 'os-and-panel' | 'os-only' | 'panel-only' {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      const raw = repos.settings.get('notifications:display-mode');
      if (raw === 'os-only' || raw === 'panel-only') return raw;
      return 'os-and-panel';
    } catch {
      return 'os-and-panel';
    }
  }

  private inScheduleWindow(current: string, from: string, to: string): boolean {
    if (from <= to) return current >= from && current <= to;
    return current >= from || current <= to;
  }
}

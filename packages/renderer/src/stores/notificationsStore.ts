import { create } from 'zustand';
import type {
  StoredNotificationItem,
  NotificationPermissionItem,
  PushSubscriptionItem,
  SilenceRule,
} from '@vela/shared';

interface PendingPermissionInfo {
  origin: string;
  windowId: number;
  hasPushRequest: boolean;
}

interface NotificationsState {
  notifications: StoredNotificationItem[];
  unreadCount: number;
  panelOpen: boolean;
  loaded: boolean;
  permissions: NotificationPermissionItem[];
  pushSubscriptions: PushSubscriptionItem[];
  silenceRules: SilenceRule[];
  pendingOrigins: PendingPermissionInfo[];
}

interface NotificationsActions {
  hydrate(): Promise<void>;
  togglePanel(): void;
  openPanel(): void;
  closePanel(): void;
  markRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
  deleteNotification(id: string): Promise<void>;
  clearAll(): Promise<void>;
  grantPermission(origin: string, opts?: { withPush?: boolean }): Promise<void>;
  denyPermission(origin: string): Promise<void>;
  getPermission(origin: string): Promise<string>;
  getSilenceRules(): Promise<SilenceRule[]>;
  setSilenceRules(rules: SilenceRule[]): Promise<void>;
  setUnreadCount(count: number): void;
  setPermissionState(origin: string, state: string): void;
  addPendingOrigin(info: PendingPermissionInfo): void;
  removePendingOrigin(origin: string): void;
  refetchIfOpen(): Promise<void>;
  fetchPushSubscriptions(): Promise<void>;
  unsubscribePush(origin: string): Promise<void>;
  unsubscribeAllPush(): Promise<void>;
}

export const useNotificationsStore = create<NotificationsState & NotificationsActions>(
  (set, get) => ({
    notifications: [],
    unreadCount: 0,
    panelOpen: false,
    loaded: false,
    permissions: [],
    pushSubscriptions: [],
    silenceRules: [],
    pendingOrigins: [],

    async hydrate() {
      const [countRes, notifRes, permsRes] = await Promise.all([
        window.api.notifications.getUnreadCount(),
        window.api.notifications.getAll(),
        window.api.notifications.getAllPermissions(),
      ]);
      set({
        loaded: true,
        unreadCount: countRes.ok ? countRes.data : 0,
        notifications: notifRes.ok ? notifRes.data : [],
        permissions: permsRes.ok ? permsRes.data : [],
      });
    },

    togglePanel() {
      const { panelOpen } = get();
      if (panelOpen) get().closePanel();
      else void get().openPanel();
    },

    openPanel() {
      set({ panelOpen: true });
      void get().refetchIfOpen();
      void window.api.layout.setNotificationPanelWidth({ width: 320 });
    },

    closePanel() {
      set({ panelOpen: false });
      void window.api.layout.setNotificationPanelWidth({ width: 0 });
    },

    async markRead(id) {
      const res = await window.api.notifications.markRead({ id });
      if (!res.ok) return;
      set((s) => ({
        notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
        unreadCount: Math.max(0, s.unreadCount - (s.notifications.find((n) => n.id === id && !n.read) ? 1 : 0)),
      }));
    },

    async markAllRead() {
      const res = await window.api.notifications.markAllRead();
      if (!res.ok) return;
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    },

    async deleteNotification(id) {
      const res = await window.api.notifications.delete({ id });
      if (!res.ok) return;
      set((s) => {
        const target = s.notifications.find((n) => n.id === id);
        return {
          notifications: s.notifications.filter((n) => n.id !== id),
          unreadCount: target && !target.read ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
        };
      });
    },

    async clearAll() {
      const res = await window.api.notifications.clearAll();
      if (!res.ok) return;
      set({ notifications: [], unreadCount: 0 });
    },

    async grantPermission(origin, opts) {
      const res = await window.api.notifications.grantPermission({ origin, withPush: opts?.withPush });
      if (!res.ok) return;
      get().removePendingOrigin(origin);
      set((s) => {
        const existing = s.permissions.find((p) => p.origin === origin);
        if (existing) {
          return { permissions: s.permissions.map((p) => p.origin === origin ? { ...p, state: 'granted' as const, grantedAt: Date.now() } : p) };
        }
        return { permissions: [...s.permissions, { origin, state: 'granted' as const, grantedAt: Date.now() }] };
      });
    },

    async denyPermission(origin) {
      const res = await window.api.notifications.denyPermission({ origin });
      if (!res.ok) return;
      get().removePendingOrigin(origin);
      set((s) => {
        const existing = s.permissions.find((p) => p.origin === origin);
        if (existing) {
          return { permissions: s.permissions.map((p) => p.origin === origin ? { ...p, state: 'denied' as const, deniedAt: Date.now() } : p) };
        }
        return { permissions: [...s.permissions, { origin, state: 'denied' as const, deniedAt: Date.now() }] };
      });
    },

    async getPermission(origin) {
      const res = await window.api.notifications.getPermission({ origin });
      return res.ok ? res.data : 'default';
    },

    async getSilenceRules() {
      const res = await window.api.notifications.getSilenceRules();
      const rules = res.ok ? (res.data as SilenceRule[]) : [];
      set({ silenceRules: rules });
      return rules;
    },

    async setSilenceRules(rules) {
      const res = await window.api.notifications.setSilenceRules({ rules });
      if (!res.ok) return;
      set({ silenceRules: rules });
    },

    setUnreadCount(count) {
      set({ unreadCount: count });
    },

    setPermissionState(origin, state) {
      set((s) => {
        const existing = s.permissions.find((p) => p.origin === origin);
        if (state === 'granted') {
          if (existing) {
            return { permissions: s.permissions.map((p) => p.origin === origin ? { ...p, state: 'granted' as const } : p) };
          }
          return { permissions: [...s.permissions, { origin, state: 'granted' as const }] };
        }
        if (state === 'denied') {
          if (existing) {
            return { permissions: s.permissions.map((p) => p.origin === origin ? { ...p, state: 'denied' as const } : p) };
          }
          return { permissions: [...s.permissions, { origin, state: 'denied' as const }] };
        }
        // For revocation, remove from list
        return { permissions: s.permissions.filter((p) => p.origin !== origin) };
      });
    },

    addPendingOrigin(info) {
      set((s) => {
        const already = s.pendingOrigins.some((o) => o.origin === info.origin);
        if (already) return {};
        return { pendingOrigins: [...s.pendingOrigins, info] };
      });
    },

    removePendingOrigin(origin) {
      set((s) => ({
        pendingOrigins: s.pendingOrigins.filter((o) => o.origin !== origin),
      }));
    },

    async refetchIfOpen() {
      const { panelOpen } = get();
      if (!panelOpen) return;
      const [notifRes, countRes] = await Promise.all([
        window.api.notifications.getAll(),
        window.api.notifications.getUnreadCount(),
      ]);
      set({
        notifications: notifRes.ok ? notifRes.data : [],
        unreadCount: countRes.ok ? countRes.data : 0,
      });
    },

    async fetchPushSubscriptions() {
      const res = await window.api.push.list();
      if (res.ok) set({ pushSubscriptions: res.data });
    },

    async unsubscribePush(origin) {
      const res = await window.api.push.unsubscribe({ origin });
      if (!res.ok) return;
      set((s) => ({ pushSubscriptions: s.pushSubscriptions.filter((sub) => sub.origin !== origin) }));
      get().setPermissionState(origin, 'revoked');
    },

    async unsubscribeAllPush() {
      const res = await window.api.push.unsubscribeAll();
      if (!res.ok) return;
      set({ pushSubscriptions: [] });
    },
  }),
);

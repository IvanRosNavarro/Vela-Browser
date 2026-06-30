import { create } from 'zustand';

export interface MediaPermissionItem {
  origin: string;
  state: 'granted' | 'denied';
  grantedAt?: number;
  deniedAt?: number;
}

interface PendingMediaPermission {
  origin: string;
  windowId: number;
  mediaTypes: Array<'video' | 'audio'>;
}

interface MediaPermissionState {
  permissions: MediaPermissionItem[];
  pendingOrigins: PendingMediaPermission[];
}

interface MediaPermissionActions {
  hydrate(): Promise<void>;
  grant(origin: string): Promise<void>;
  deny(origin: string): Promise<void>;
  revoke(origin: string): Promise<void>;
  addPendingOrigin(info: PendingMediaPermission): void;
  removePendingOrigin(origin: string): void;
  setPermissionState(origin: string, state: 'granted' | 'denied' | 'none'): void;
}

export const useMediaPermissionStore = create<MediaPermissionState & MediaPermissionActions>(
  (set, get) => ({
    permissions: [],
    pendingOrigins: [],

    async hydrate() {
      const res = await window.api.mediaPermission.getAll();
      if (res.ok) set({ permissions: res.data as MediaPermissionItem[] });
    },

    async grant(origin) {
      const res = await window.api.mediaPermission.grant({ origin });
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

    async deny(origin) {
      const res = await window.api.mediaPermission.deny({ origin });
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

    async revoke(origin) {
      const res = await window.api.mediaPermission.revoke({ origin });
      if (!res.ok) return;
      set((s) => ({ permissions: s.permissions.filter((p) => p.origin !== origin) }));
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

    setPermissionState(origin, state) {
      if (state === 'none') {
        set((s) => ({ permissions: s.permissions.filter((p) => p.origin !== origin) }));
        return;
      }
      set((s) => {
        const existing = s.permissions.find((p) => p.origin === origin);
        if (existing) {
          return { permissions: s.permissions.map((p) => p.origin === origin ? { ...p, state } : p) };
        }
        return { permissions: [...s.permissions, { origin, state }] };
      });
    },
  }),
);

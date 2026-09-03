import { create } from 'zustand';
import type { SyncStatus, DeviceInfo, RemoteSyncProfile } from '@vela/shared';
import { call } from '../lib/ipc';

export type SyncUiStep = 'idle' | 'email' | 'waiting-click' | 'password' | 'profile' | 'active';

export interface SyncState {
  status: SyncStatus;
  uiStep: SyncUiStep;
  pendingToken: string | null;
  sessionExpired: boolean;
  /** Contraseña de sync en memoria sólo mientras el modal Recovery Card está abierto. */
  recentPassword: string | null;
  /** Perfiles que el usuario ya tiene en el servidor, para elegir a cuál vincularse. */
  remoteProfiles: RemoteSyncProfile[];

  hydrate: () => Promise<void>;
  requestMagicLink: (email: string) => Promise<void>;
  listRemoteProfiles: (token: string, syncPassword: string) => Promise<RemoteSyncProfile[]>;
  setupSync: (
    token: string,
    syncPassword: string,
    remoteProfileId?: string | null,
  ) => Promise<boolean>;
  syncNow: () => Promise<void>;
  getDevices: () => Promise<DeviceInfo[]>;
  disconnectDevice: (tokenSuffix: string) => Promise<void>;
  deactivate: () => Promise<void>;

  setUiStep: (step: SyncUiStep) => void;
  setPendingToken: (token: string) => void;
  setRecentPassword: (pw: string | null) => void;
  updateStatus: (status: SyncStatus) => void;
  markSessionExpired: () => void;
  clearSessionExpired: () => void;
}

const defaultStatus: SyncStatus = {
  configured: false,
  connected: false,
  lastSyncAt: null,
  syncInProgress: false,
};

export const useSyncStore = create<SyncState>((set, get) => ({
  status: defaultStatus,
  uiStep: 'idle',
  pendingToken: null,
  sessionExpired: false,
  recentPassword: null,
  remoteProfiles: [],

  async hydrate() {
    try {
      const status = await call(() => window.api.sync.getStatus());
      set((state) => {
        // El token puede venir de main (sobrevive reloads) o del state Zustand actual.
        const effectiveToken = status.pendingCallbackToken ?? state.pendingToken ?? null;
        return {
          status,
          pendingToken: effectiveToken,
          uiStep: effectiveToken ? 'password' : status.configured ? 'active' : 'idle',
        };
      });
    } catch {
      // sin sync configurado, estado por defecto
    }
  },

  async requestMagicLink(email) {
    await call(() => window.api.sync.requestMagicLink({ email }));
  },

  async listRemoteProfiles(token, syncPassword) {
    const profiles = await call(() =>
      window.api.sync.listRemoteProfiles({ token, syncPassword }),
    );
    set({ remoteProfiles: profiles });
    return profiles;
  },

  async setupSync(token, syncPassword, remoteProfileId = null) {
    try {
      const status = await call(() =>
        window.api.sync.setup({ token, syncPassword, remoteProfileId }),
      );
      set({ status, uiStep: 'active', pendingToken: null, remoteProfiles: [] });
      return true;
    } catch {
      return false;
    }
  },

  async syncNow() {
    await call(() => window.api.sync.syncNow());
  },

  async getDevices() {
    return call(() => window.api.sync.getDevices());
  },

  async disconnectDevice(tokenSuffix) {
    await call(() => window.api.sync.disconnectDevice({ tokenSuffix }));
  },

  async deactivate() {
    await call(() => window.api.sync.deactivate());
    set({
      status: defaultStatus,
      uiStep: 'idle',
      pendingToken: null,
      recentPassword: null,
      remoteProfiles: [],
    });
  },

  setUiStep(step) {
    set({ uiStep: step });
  },

  setPendingToken(token) {
    set({ pendingToken: token, uiStep: 'password' });
  },

  setRecentPassword(pw) {
    set({ recentPassword: pw });
  },

  updateStatus(status) {
    set({ status });
    if (!status.configured) {
      set({ uiStep: 'idle' });
    }
  },

  markSessionExpired() {
    set({ sessionExpired: true });
  },

  clearSessionExpired() {
    set({ sessionExpired: false, uiStep: 'idle', status: defaultStatus });
  },
}));

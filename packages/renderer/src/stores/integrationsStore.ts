import { create } from 'zustand';
import type {
  DeviceFlowPrompt,
  IntegrationProviderId,
  IntegrationsStatus,
} from '@vela/shared';

const PROVIDER: IntegrationProviderId = 'github';

function emptyStatus(): IntegrationsStatus {
  return {
    provider: PROVIDER,
    phase: 'disconnected',
    account: null,
    error: null,
    enabled: true,
    pending: [],
    lastCheckAt: null,
    checking: false,
  };
}

interface IntegrationsState {
  status: IntegrationsStatus;
  /** Código que el usuario tiene que teclear en GitHub, mientras dure. */
  devicePrompt: DeviceFlowPrompt | null;
  busy: boolean;
  loaded: boolean;

  hydrate: () => Promise<void>;
  applyStatus: (status: IntegrationsStatus) => void;
  startDeviceFlow: () => Promise<void>;
  cancelDeviceFlow: () => Promise<void>;
  connectToken: (token: string) => Promise<string | null>;
  disconnect: () => Promise<void>;
  checkNow: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setClientId: (clientId: string) => Promise<void>;
  openPr: (url: string) => Promise<void>;
}

export const useIntegrationsStore = create<IntegrationsState>((set, get) => ({
  status: emptyStatus(),
  devicePrompt: null,
  busy: false,
  loaded: false,

  hydrate: async () => {
    const res = await window.api.integrations.getStatus({ provider: PROVIDER });
    set({ status: res.ok ? res.data : emptyStatus(), loaded: true });
  },

  applyStatus: (status) => {
    // El código deja de tener sentido en cuanto la conexión se resuelve.
    const done = status.phase !== 'awaiting-authorization';
    set({ status, ...(done ? { devicePrompt: null } : {}) });
  },

  startDeviceFlow: async () => {
    set({ busy: true });
    const res = await window.api.integrations.startDeviceFlow({ provider: PROVIDER });
    if (res.ok) {
      set({ devicePrompt: res.data, busy: false });
    } else {
      set({ busy: false });
      await get().hydrate();
    }
  },

  cancelDeviceFlow: async () => {
    await window.api.integrations.cancelDeviceFlow({ provider: PROVIDER });
    set({ devicePrompt: null });
    await get().hydrate();
  },

  connectToken: async (token) => {
    set({ busy: true });
    const res = await window.api.integrations.connectToken({ provider: PROVIDER, token });
    set({ busy: false });
    if (res.ok) {
      set({ status: res.data });
      return null;
    }
    await get().hydrate();
    return get().status.error ?? 'No se pudo conectar con GitHub.';
  },

  disconnect: async () => {
    const res = await window.api.integrations.disconnect({ provider: PROVIDER });
    if (res.ok) set({ status: res.data, devicePrompt: null });
  },

  checkNow: async () => {
    set({ busy: true });
    const res = await window.api.integrations.checkNow({ provider: PROVIDER });
    set({ busy: false });
    if (res.ok) set({ status: res.data });
  },

  setEnabled: async (enabled) => {
    const res = await window.api.integrations.setEnabled({ provider: PROVIDER, enabled });
    if (res.ok) set({ status: res.data });
  },

  setClientId: async (clientId) => {
    await window.api.integrations.setClientId({ provider: PROVIDER, clientId });
  },

  openPr: async (url) => {
    await window.api.integrations.openPr({ url, activate: true });
  },
}));

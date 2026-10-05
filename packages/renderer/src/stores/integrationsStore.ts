import { create } from 'zustand';
import {
  INTEGRATION_PROVIDERS,
  type DeviceFlowPrompt,
  type IntegrationItem,
  type IntegrationProviderId,
  type IntegrationsStatus,
  type IpcResponse,
} from '@vela/shared';

type Statuses = Record<IntegrationProviderId, IntegrationsStatus>;

function emptyStatus(provider: IntegrationProviderId): IntegrationsStatus {
  return {
    provider,
    phase: 'disconnected',
    account: null,
    error: null,
    enabled: true,
    pending: [],
    lastCheckAt: null,
    checking: false,
  };
}

function emptyStatuses(): Statuses {
  return {
    github: emptyStatus('github'),
    bitbucket: emptyStatus('bitbucket'),
    jira: emptyStatus('jira'),
  };
}

/** El motivo de un rechazo de la plataforma, si main lo mandó. */
function rejection(res: IpcResponse<unknown>): string | null {
  if (res.ok) return null;
  const details = res.details as { message?: unknown } | undefined;
  return typeof details?.message === 'string' ? details.message : null;
}

export interface TokenConnection {
  token: string;
  email?: string;
  site?: string;
}

interface IntegrationsState {
  statuses: Statuses;
  /** Código que el usuario tiene que teclear en GitHub, mientras dure. */
  devicePrompt: DeviceFlowPrompt | null;
  /** Proveedor con una operación en curso (conectar, comprobar). */
  busy: IntegrationProviderId | null;
  loaded: boolean;

  hydrate: () => Promise<void>;
  applyStatus: (status: IntegrationsStatus) => void;
  /** Devuelve el motivo si GitHub no aceptó la petición. */
  startDeviceFlow: () => Promise<string | null>;
  cancelDeviceFlow: () => Promise<void>;
  /** Devuelve el motivo si la plataforma rechazó el token. */
  connectToken: (provider: IntegrationProviderId, input: TokenConnection) => Promise<string | null>;
  disconnect: (provider: IntegrationProviderId) => Promise<void>;
  checkNow: (provider: IntegrationProviderId) => Promise<void>;
  setEnabled: (provider: IntegrationProviderId, enabled: boolean) => Promise<void>;
  setClientId: (clientId: string) => Promise<void>;
  openPr: (url: string) => Promise<void>;
}

export const useIntegrationsStore = create<IntegrationsState>((set, get) => ({
  statuses: emptyStatuses(),
  devicePrompt: null,
  busy: null,
  loaded: false,

  hydrate: async () => {
    const results = await Promise.all(
      INTEGRATION_PROVIDERS.map((provider) => window.api.integrations.getStatus({ provider })),
    );
    const statuses = emptyStatuses();
    results.forEach((res, i) => {
      const provider = INTEGRATION_PROVIDERS[i]!;
      if (res.ok) statuses[provider] = res.data;
    });
    set({ statuses, loaded: true });
  },

  applyStatus: (status) => {
    set((state) => {
      const statuses = { ...state.statuses, [status.provider]: status };
      // El código deja de tener sentido en cuanto la conexión de GitHub se resuelve.
      const githubDone = status.provider === 'github' && status.phase !== 'awaiting-authorization';
      return { statuses, ...(githubDone ? { devicePrompt: null } : {}) };
    });
  },

  startDeviceFlow: async () => {
    set({ busy: 'github' });
    const res = await window.api.integrations.startDeviceFlow({ provider: 'github' });
    set({ busy: null });
    if (res.ok) {
      set({ devicePrompt: res.data });
      return null;
    }
    return rejection(res) ?? 'GitHub no aceptó la petición de autorización.';
  },

  cancelDeviceFlow: async () => {
    await window.api.integrations.cancelDeviceFlow({ provider: 'github' });
    set({ devicePrompt: null });
    await get().hydrate();
  },

  connectToken: async (provider, input) => {
    set({ busy: provider });
    const res = await window.api.integrations.connectToken({ provider, ...input });
    set({ busy: null });
    if (res.ok) {
      get().applyStatus(res.data);
      return null;
    }
    return rejection(res) ?? 'No se pudo conectar. Revisa los datos e inténtalo otra vez.';
  },

  disconnect: async (provider) => {
    const res = await window.api.integrations.disconnect({ provider });
    if (res.ok) get().applyStatus(res.data);
    if (provider === 'github') set({ devicePrompt: null });
  },

  checkNow: async (provider) => {
    set({ busy: provider });
    const res = await window.api.integrations.checkNow({ provider });
    set({ busy: null });
    if (res.ok) get().applyStatus(res.data);
  },

  setEnabled: async (provider, enabled) => {
    const res = await window.api.integrations.setEnabled({ provider, enabled });
    if (res.ok) get().applyStatus(res.data);
  },

  setClientId: async (clientId) => {
    await window.api.integrations.setClientId({ provider: 'github', clientId });
  },

  openPr: async (url) => {
    await window.api.integrations.openPr({ url, activate: true });
  },
}));

/**
 * Pull requests que te esperan en todas las plataformas conectadas. Los issues
 * de Jira no cuentan: los asignados suelen ser el backlog entero y el número
 * dejaría de decir nada.
 */
export function pendingPullRequests(statuses: Statuses): IntegrationItem[] {
  return INTEGRATION_PROVIDERS.flatMap((provider) => {
    const status = statuses[provider];
    if (status.phase !== 'connected' || !status.enabled) return [];
    return status.pending.filter((item) => item.kind === 'pull-request');
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}

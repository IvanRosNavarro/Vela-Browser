import { create } from 'zustand';
import type { ClientCertRememberedChoice } from '@vela/shared';

interface ClientCertState {
  choices: ClientCertRememberedChoice[];
}

interface ClientCertActions {
  hydrate(): Promise<void>;
  forget(origin: string): Promise<void>;
}

export const useClientCertStore = create<ClientCertState & ClientCertActions>((set) => ({
  choices: [],

  async hydrate() {
    const res = await window.api.clientCert.getAll();
    if (res.ok) set({ choices: res.data });
  },

  async forget(origin) {
    const res = await window.api.clientCert.forget({ origin });
    if (!res.ok) return;
    set((s) => ({ choices: s.choices.filter((c) => c.origin !== origin) }));
  },
}));

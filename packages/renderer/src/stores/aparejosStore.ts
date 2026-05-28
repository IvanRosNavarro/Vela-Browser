import { create } from 'zustand';
import type { AparejoId, AparejoStatus } from '@vela/shared';

interface AparejoState {
  aparejos: AparejoStatus[];
  loaded: boolean;

  hydrate: () => Promise<void>;
  setEnabled: (id: AparejoId, enabled: boolean) => Promise<void>;
  isIzado: (id: AparejoId) => boolean;
  setAparejos: (aparejos: AparejoStatus[]) => void;
}

export const useAparejosStore = create<AparejoState>((set, get) => ({
  aparejos: [],
  loaded: false,

  hydrate: async () => {
    try {
      const res = await window.api.aparejos.getAll();
      if (res.ok) {
        set({ aparejos: res.data, loaded: true });
      } else {
        set({ loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },

  setEnabled: async (id, enabled) => {
    const res = await window.api.aparejos.set({ id, enabled });
    if (res.ok) {
      set({ aparejos: res.data });
    }
  },

  isIzado: (id) => {
    const a = get().aparejos.find((x) => x.id === id);
    return a?.enabled ?? true;
  },

  setAparejos: (aparejos) => {
    set({ aparejos });
  },
}));

import { create } from 'zustand';
import type { SystemProcessResource, TabResource } from '@vela/shared';
import { call } from '../lib/ipc';
import { useRuntimeStore } from './runtimeStore';

interface ResourcesState {
  isOpen: boolean;
  resources: TabResource[];
  otherProcesses: SystemProcessResource[];
  /** Memoria de todos los procesos de la app, en MB. */
  totalMemoryMb: number;
  processCount: number;
  loading: boolean;

  open: () => void;
  close: () => void;
  refresh: () => Promise<void>;
}

let pollingId: ReturnType<typeof setInterval> | null = null;

export const useResourcesStore = create<ResourcesState>((set, get) => ({
  isOpen: false,
  resources: [],
  otherProcesses: [],
  totalMemoryMb: 0,
  processCount: 0,
  loading: false,

  open() {
    set({ isOpen: true });
    void get().refresh();
    if (pollingId !== null) clearInterval(pollingId);
    pollingId = setInterval(() => { void get().refresh(); }, 2000);
  },

  close() {
    if (pollingId !== null) {
      clearInterval(pollingId);
      pollingId = null;
    }
    set({ isOpen: false, resources: [], otherProcesses: [], totalMemoryMb: 0, processCount: 0 });
  },

  async refresh() {
    const profileId = useRuntimeStore.getState().currentProfileId;
    if (!profileId) return;
    set({ loading: true });
    try {
      const snapshot = await call(() => window.api.resources.getAll({ profileId }));
      set({
        resources: snapshot.tabs,
        otherProcesses: snapshot.otherProcesses,
        // El total viene calculado por proceso en main: sumar filas contaría
        // dos veces los renderers compartidos por varias pestañas.
        totalMemoryMb: snapshot.totalMemoryRss / 1024,
        processCount: snapshot.processCount,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },
}));

import { create } from 'zustand';
import type { TabResource } from '@vela/shared';
import { call } from '../lib/ipc';
import { useRuntimeStore } from './runtimeStore';

interface ResourcesState {
  isOpen: boolean;
  resources: TabResource[];
  totalMemoryMb: number;
  loading: boolean;

  open: () => void;
  close: () => void;
  refresh: () => Promise<void>;
}

let pollingId: ReturnType<typeof setInterval> | null = null;

export const useResourcesStore = create<ResourcesState>((set, get) => ({
  isOpen: false,
  resources: [],
  totalMemoryMb: 0,
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
    set({ isOpen: false, resources: [], totalMemoryMb: 0 });
  },

  async refresh() {
    const profileId = useRuntimeStore.getState().currentProfileId;
    if (!profileId) return;
    set({ loading: true });
    try {
      const resources = await call(() => window.api.resources.getAll({ profileId }));
      const totalMemoryMb = resources.reduce((sum, r) => sum + r.memoryRss, 0) / 1024;
      set({ resources, totalMemoryMb, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));

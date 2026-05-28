import { create } from 'zustand';
import type { WindowInfo } from '@vela/shared';
import { call } from '../lib/ipc';

interface MultiWindowState {
  stableWindowId: string | null;
  isPrimary: boolean;
  openWindows: WindowInfo[];

  hydrate(): Promise<void>;
  setOpenWindows(windows: WindowInfo[]): void;
  setStableId(id: string, isPrimary: boolean): void;
}

export const useMultiWindowStore = create<MultiWindowState>((set) => ({
  stableWindowId: null,
  isPrimary: true,
  openWindows: [],

  async hydrate() {
    try {
      const [idRes, allRes] = await Promise.all([
        call(() => window.api.window.getCurrentId()),
        call(() => window.api.window.getAllForProfile()),
      ]);
      set({
        stableWindowId: idRes.windowId,
        isPrimary: idRes.isPrimary,
        openWindows: allRes,
      });
    } catch {
      // no crítico; el indicador simplemente no mostrará nada
    }
  },

  setOpenWindows(windows) {
    set({ openWindows: windows });
  },

  setStableId(id, isPrimary) {
    set({ stableWindowId: id, isPrimary });
  },
}));

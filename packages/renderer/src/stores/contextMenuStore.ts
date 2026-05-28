import { create } from 'zustand';
import type { ContextMenuShowPayload } from '@vela/shared';

interface ContextMenuState {
  menu: ContextMenuShowPayload | null;
  show: (payload: ContextMenuShowPayload) => void;
  hide: () => void;
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  menu: null,
  show: (payload) => set({ menu: payload }),
  hide: () => set({ menu: null }),
}));

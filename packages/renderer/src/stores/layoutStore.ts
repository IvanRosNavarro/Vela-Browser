import { create } from 'zustand';
import type { WindowLayout, LayoutMode, PanelId } from '@vela/shared';

const DEFAULT_LAYOUT: WindowLayout = {
  mode: 'single',
  panels: [{ panelId: 'left', activeTabId: null }],
  splitRatio: 0.5,
  focusedPanelId: 'left',
};

export interface LayoutState {
  layout: WindowLayout;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  setLayout: (layout: WindowLayout) => void;
  setSplit: (mode: LayoutMode) => Promise<void>;
  closeSplit: () => Promise<void>;
  setRatio: (ratio: number) => void;
  commitRatio: (ratio: number) => Promise<void>;
  setFocusedPanel: (panelId: PanelId) => Promise<void>;
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layout: DEFAULT_LAYOUT,
  hydrated: false,

  async hydrate() {
    try {
      const res = await window.api.layout.getLayout();
      if (res.ok) {
        set({ layout: res.data, hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },

  setLayout(layout) {
    set({ layout });
  },

  async setSplit(mode) {
    try {
      const res = await window.api.layout.setSplit({ mode });
      if (res.ok) set({ layout: res.data });
    } catch { /* ignorar */ }
  },

  async closeSplit() {
    try {
      const res = await window.api.layout.closeSplit();
      if (res.ok) set({ layout: res.data });
    } catch { /* ignorar */ }
  },

  setRatio(ratio) {
    // Actualización local inmediata para fluidez; main se actualiza en commitRatio.
    const cur = get().layout;
    set({
      layout: {
        ...cur,
        splitRatio: Math.max(0.2, Math.min(0.8, ratio)),
      },
    });
    void window.api.layout.setRatio({ ratio });
  },

  async commitRatio(ratio) {
    const clamped = Math.max(0.2, Math.min(0.8, ratio));
    const cur = get().layout;
    set({ layout: { ...cur, splitRatio: clamped } });
    try {
      await window.api.layout.setRatio({ ratio: clamped });
    } catch { /* ignorar */ }
  },

  async setFocusedPanel(panelId) {
    const cur = get().layout;
    set({ layout: { ...cur, focusedPanelId: panelId } });
    try {
      await window.api.layout.setFocusedPanel({ panelId });
    } catch { /* ignorar */ }
  },
}));

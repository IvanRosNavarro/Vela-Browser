import { create } from 'zustand';

export interface MruTabEntry {
  id: string;
  url: string;
  originalTitle: string;
  customTitle: string | null;
  favicon: string | null;
  workspaceId: string;
  workspaceName: string;
  discarded: boolean;
  lastActiveAt: number | null;
}

interface MruSwitcherState {
  isOpen: boolean;
  tabs: MruTabEntry[];
  selectedIndex: number;
  previewsEnabled: boolean;

  open: (tabs: MruTabEntry[], direction: 'forward' | 'backward', previewsEnabled: boolean) => void;
  navigate: (delta: 1 | -1) => void;
  close: () => void;
  /** Called on Ctrl keyUp: confirms the selected card. */
  commitOrDirect: () => void;
}

export const useMruSwitcherStore = create<MruSwitcherState>((set, get) => ({
  isOpen: false,
  tabs: [],
  selectedIndex: 0,
  previewsEnabled: true,

  open(tabs, direction, previewsEnabled) {
    const state = get();
    const delta = direction === 'forward' ? 1 : -1;

    if (state.isOpen) {
      const next = (state.selectedIndex + delta + state.tabs.length) % state.tabs.length;
      set({ selectedIndex: next });
      return;
    }

    const initialIdx =
      direction === 'forward' ? Math.min(1, tabs.length - 1) : Math.max(0, tabs.length - 1);
    set({ isOpen: true, tabs, previewsEnabled, selectedIndex: initialIdx });
  },

  navigate(delta) {
    set((state) => {
      if (!state.isOpen || state.tabs.length === 0) return {};
      const next = (state.selectedIndex + delta + state.tabs.length) % state.tabs.length;
      return { selectedIndex: next };
    });
  },

  close() {
    set({ isOpen: false, tabs: [], selectedIndex: 0 });
  },

  commitOrDirect() {
    const { isOpen, tabs, selectedIndex } = get();
    if (!isOpen) return;
    const tab = tabs[selectedIndex];
    if (tab) void window.api.mru.confirm({ tabId: tab.id });
    set({ isOpen: false, tabs: [], selectedIndex: 0 });
  },
}));

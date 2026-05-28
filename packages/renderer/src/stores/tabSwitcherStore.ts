import { create } from 'zustand';
import type { RecentlyClosedTab } from '@vela/shared';
import { call } from '../lib/ipc';

export interface TabSwitcherState {
  isOpen: boolean;
  query: string;
  focusedIndex: number;
  recentlyClosed: RecentlyClosedTab[];

  open: () => Promise<void>;
  close: () => void;
  setQuery: (q: string) => void;
  setFocusedIndex: (i: number) => void;
  loadRecentlyClosed: () => Promise<void>;
}

export const useTabSwitcherStore = create<TabSwitcherState>((set) => ({
  isOpen: false,
  query: '',
  focusedIndex: 0,
  recentlyClosed: [],

  async open() {
    let recent: RecentlyClosedTab[] = [];
    try {
      const res = await call(() => window.api.tab.recentlyClosed());
      recent = res;
    } catch { /* keep empty */ }
    set({ isOpen: true, query: '', focusedIndex: 0, recentlyClosed: recent });
  },

  close() {
    set({ isOpen: false, query: '', focusedIndex: 0, recentlyClosed: [] });
  },

  setQuery(q) {
    set({ query: q, focusedIndex: 0 });
  },

  setFocusedIndex(i) {
    set({ focusedIndex: i });
  },

  async loadRecentlyClosed() {
    try {
      const res = await call(() => window.api.tab.recentlyClosed());
      set({ recentlyClosed: res });
    } catch { /* keep */ }
  },
}));

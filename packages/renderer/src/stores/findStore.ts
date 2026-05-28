import { create } from 'zustand';
import { useRuntimeStore } from './runtimeStore';

interface FindState {
  open: boolean;
  query: string;
  matchCase: boolean;
  openBar(): void;
  closeBar(): void;
  forceClose(): void;
  syncQuery(text: string, matchCase: boolean): void;
}

export const useFindStore = create<FindState>((set) => ({
  open: false,
  query: '',
  matchCase: false,

  openBar() {
    const windowId = useRuntimeStore.getState().currentWindowId;
    if (windowId === null) return;
    set({ open: true });
    void window.api.findBar.open({ windowId });
  },

  closeBar() {
    const windowId = useRuntimeStore.getState().currentWindowId;
    if (windowId === null) return;
    set({ open: false, query: '', matchCase: false });
    void window.api.findBar.close({ windowId });
  },

  forceClose() {
    set({ open: false, query: '', matchCase: false });
  },

  syncQuery(text: string, matchCase: boolean) {
    set({ query: text, matchCase });
  },
}));

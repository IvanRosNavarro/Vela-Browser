import { create } from 'zustand';
import type { FrameContext, TabRuntime } from '@vela/shared';
import { call } from '../lib/ipc';

export interface RuntimeState {
  tabRuntimes: Record<string, TabRuntime>;
  activeTabIdByWindow: Record<number, string | null>;
  currentWindowId: number | null;
  /**
   * Perfil al que sirve este renderer. Estable durante toda su vida (Fase 3
   * fuerza una ventana = un perfil; cambiar de perfil exige nueva ventana).
   * Lo expone runtimeStore para que componentes y subscribers puedan
   * confirmar el contexto sin volver a IPC.
   */
  currentProfileId: string | null;
  loadingByTabId: Record<string, boolean>;

  setCurrentWindow: (id: number) => void;
  setFrameContext: (ctx: FrameContext) => void;
  setActiveTab: (windowId: number, tabId: string | null) => void;
  upsertTabRuntime: (runtime: TabRuntime) => void;
  removeTabRuntime: (tabId: string) => void;
  setTabLoading: (tabId: string, loading: boolean) => void;

  activateTab: (tabId: string) => Promise<void>;
  closeTab: (tabId: string) => Promise<void>;
  discardTab: (tabId: string) => Promise<void>;
  restoreTab: (tabId: string) => Promise<void>;
}

export const useRuntimeStore = create<RuntimeState>((set) => ({
  tabRuntimes: {},
  activeTabIdByWindow: {},
  currentWindowId: null,
  currentProfileId: null,
  loadingByTabId: {},

  setCurrentWindow(id) {
    set({ currentWindowId: id });
  },

  setFrameContext(ctx) {
    set({ currentWindowId: ctx.windowId, currentProfileId: ctx.profileId });
  },

  setActiveTab(windowId, tabId) {
    set((state) => ({
      activeTabIdByWindow: {
        ...state.activeTabIdByWindow,
        [windowId]: tabId,
      },
    }));
  },

  upsertTabRuntime(runtime) {
    set((state) => ({
      tabRuntimes: { ...state.tabRuntimes, [runtime.id]: runtime },
    }));
  },

  removeTabRuntime(tabId) {
    set((state) => {
      if (!(tabId in state.tabRuntimes)) return {};
      const next = { ...state.tabRuntimes };
      delete next[tabId];
      return { tabRuntimes: next };
    });
  },

  setTabLoading(tabId, loading) {
    set((state) => ({
      loadingByTabId: { ...state.loadingByTabId, [tabId]: loading },
    }));
  },

  async activateTab(tabId) {
    await call(() => window.api.tab.activate({ id: tabId }));
  },

  async closeTab(tabId) {
    await call(() => window.api.tab.close({ id: tabId }));
  },

  async discardTab(tabId) {
    await call(() => window.api.tab.discard({ id: tabId }));
  },

  async restoreTab(tabId) {
    await call(() => window.api.tab.restore({ id: tabId }));
  },
}));

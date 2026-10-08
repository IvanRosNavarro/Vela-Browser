import { create } from 'zustand';
import {
  DEFAULT_TITLEBAR_CONFIG,
  type TitleBarIconConfig,
  type TitleBarIconId,
} from '@vela/shared';

interface TitleBarIconState {
  iconConfig: TitleBarIconConfig[];
  loaded: boolean;

  hydrate: () => Promise<void>;
  setVisible: (id: TitleBarIconId, visible: boolean) => Promise<void>;
  isVisible: (id: TitleBarIconId) => boolean;
  setConfig: (config: TitleBarIconConfig[]) => void;
}

export const useTitleBarIconStore = create<TitleBarIconState>((set, get) => ({
  iconConfig: DEFAULT_TITLEBAR_CONFIG,
  loaded: false,

  hydrate: async () => {
    const res = await window.api.titleBarConfig.getConfig();
    if (res.ok) {
      set({ iconConfig: res.data, loaded: true });
    } else {
      set({ iconConfig: DEFAULT_TITLEBAR_CONFIG, loaded: true });
    }
  },

  setVisible: async (id, visible) => {
    const next = get().iconConfig.map((c) =>
      c.id === id ? { ...c, visible } : c,
    );
    const prev = get().iconConfig;
    set({ iconConfig: next });
    const res = await window.api.titleBarConfig.setConfig({ config: next });
    // Si main lo rechaza no se ha guardado nada: no dejar el interruptor
    // mostrando un estado que se perderá al recargar.
    if (!res.ok) set({ iconConfig: prev });
  },

  isVisible: (id) => {
    const c = get().iconConfig.find((x) => x.id === id);
    return c?.visible ?? true;
  },

  setConfig: (config) => {
    set({ iconConfig: config });
  },
}));

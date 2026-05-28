import { create } from 'zustand';
import {
  DEFAULT_URLBAR_CONFIG,
  type UrlBarIconConfig,
  type UrlBarIconId,
} from '@vela/shared';
import { generateKeyBetween } from 'fractional-indexing';

interface UrlBarState {
  iconConfig: UrlBarIconConfig[];
  loaded: boolean;

  hydrate: () => Promise<void>;
  setVisible: (id: UrlBarIconId, visible: boolean) => Promise<void>;
  reorder: (orderedIds: UrlBarIconId[]) => Promise<void>;
  isVisible: (id: UrlBarIconId) => boolean;
  getOrderedVisible: () => UrlBarIconConfig[];
  setConfig: (config: UrlBarIconConfig[]) => void;
}

function sortByPosition(configs: UrlBarIconConfig[]): UrlBarIconConfig[] {
  return [...configs].sort((a, b) => (a.position < b.position ? -1 : 1));
}

export const useUrlBarStore = create<UrlBarState>((set, get) => ({
  iconConfig: DEFAULT_URLBAR_CONFIG,
  loaded: false,

  hydrate: async () => {
    const res = await window.api.urlBarConfig.getConfig();
    if (res.ok) {
      set({ iconConfig: res.data, loaded: true });
    } else {
      set({ iconConfig: DEFAULT_URLBAR_CONFIG, loaded: true });
    }
  },

  setVisible: async (id, visible) => {
    const next = get().iconConfig.map((c) =>
      c.id === id ? { ...c, visible } : c,
    );
    set({ iconConfig: next });
    await window.api.urlBarConfig.setConfig({ config: next });
  },

  reorder: async (orderedIds) => {
    const existing = get().iconConfig;
    // Assign new fractional positions based on the provided order
    let prev: string | null = null;
    const positionMap = new Map<UrlBarIconId, string>();
    for (const id of orderedIds) {
      const pos = generateKeyBetween(prev, null);
      positionMap.set(id, pos);
      prev = pos;
    }

    const next = existing.map((c) => {
      const newPos = positionMap.get(c.id);
      return newPos !== undefined ? { ...c, position: newPos } : c;
    });
    set({ iconConfig: next });
    await window.api.urlBarConfig.setConfig({ config: next });
  },

  isVisible: (id) => {
    const c = get().iconConfig.find((x) => x.id === id);
    return c?.visible ?? true;
  },

  getOrderedVisible: () => {
    const sorted = sortByPosition(get().iconConfig);
    return sorted.filter((c) => c.visible);
  },

  setConfig: (config) => {
    set({ iconConfig: config });
  },
}));

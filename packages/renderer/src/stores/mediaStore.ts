import { create } from 'zustand';
import type { MediaSource } from '@vela/shared';
import { useRuntimeStore } from './runtimeStore';

interface MediaState {
  sources: MediaSource[];
  activeCount: number;
  /** Pestañas silenciadas (estado de main; no se persiste entre reinicios). */
  mutedTabIds: ReadonlySet<string>;

  hydrate: () => Promise<void>;
  play: (tabId: string) => Promise<void>;
  pause: (tabId: string) => Promise<void>;
  skipNext: (tabId: string) => Promise<void>;
  skipPrev: (tabId: string) => Promise<void>;
  activateTab: (tabId: string, windowId: number) => Promise<void>;
  setSources: (sources: MediaSource[]) => void;
  /** Silencia o reactiva varias pestañas; el estado llega confirmado de main. */
  setMuted: (tabIds: string[], muted: boolean) => Promise<void>;
  toggleMuted: (tabId: string) => Promise<void>;
  setMutedTabIds: (ids: string[]) => void;
}

export const useMediaStore = create<MediaState>((set, get) => ({
  sources: [],
  activeCount: 0,
  mutedTabIds: new Set<string>(),

  hydrate: async () => {
    try {
      const mutedRes = await window.api.tab.getMuted();
      if (mutedRes.ok) set({ mutedTabIds: new Set(mutedRes.data.mutedTabIds) });
    } catch {
      /* sin estado de silencio no se bloquea el arranque de la shell */
    }
    const res = await window.api.media.getSources();
    if (res.ok) {
      const profileId = useRuntimeStore.getState().currentProfileId;
      const sources = profileId
        ? res.data.filter((s) => s.profileId === profileId)
        : res.data;
      set({ sources, activeCount: sources.filter((s) => s.isPlaying).length });
    }
  },

  play: async (tabId) => {
    await window.api.media.play({ tabId });
  },

  pause: async (tabId) => {
    await window.api.media.pause({ tabId });
  },

  skipNext: async (tabId) => {
    await window.api.media.skipNext({ tabId });
  },

  skipPrev: async (tabId) => {
    await window.api.media.skipPrev({ tabId });
  },

  activateTab: async (tabId, windowId) => {
    await window.api.media.activateTab({ tabId, windowId });
  },

  setSources: (sources) => {
    set({
      sources,
      activeCount: sources.filter((s) => s.isPlaying).length,
    });
  },

  setMuted: async (tabIds, muted) => {
    if (tabIds.length === 0) return;
    const res = await window.api.tab.setMuted({ ids: tabIds, muted });
    if (res.ok) set({ mutedTabIds: new Set(res.data.mutedTabIds) });
  },

  toggleMuted: async (tabId) => {
    await get().setMuted([tabId], !get().mutedTabIds.has(tabId));
  },

  setMutedTabIds: (ids) => {
    set({ mutedTabIds: new Set(ids) });
  },
}));

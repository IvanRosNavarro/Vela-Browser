import { create } from 'zustand';
import type { MediaSource } from '@vela/shared';
import { useRuntimeStore } from './runtimeStore';

interface MediaState {
  sources: MediaSource[];
  activeCount: number;

  hydrate: () => Promise<void>;
  play: (tabId: string) => Promise<void>;
  pause: (tabId: string) => Promise<void>;
  skipNext: (tabId: string) => Promise<void>;
  skipPrev: (tabId: string) => Promise<void>;
  activateTab: (tabId: string, windowId: number) => Promise<void>;
  setSources: (sources: MediaSource[]) => void;
}

export const useMediaStore = create<MediaState>((set) => ({
  sources: [],
  activeCount: 0,

  hydrate: async () => {
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
}));

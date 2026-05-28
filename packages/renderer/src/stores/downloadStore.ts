import { create } from 'zustand';
import type { DownloadItem } from '@vela/shared';

interface DownloadState {
  items: DownloadItem[];
  loaded: boolean;

  hydrate: () => Promise<void>;
  setItems: (items: DownloadItem[]) => void;

  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearCompleted: () => Promise<void>;
  showInFolder: (savePath: string) => Promise<void>;
  openFile: (savePath: string) => Promise<void>;

  activeCount: () => number;
  hasAny: () => boolean;
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  items: [],
  loaded: false,

  hydrate: async () => {
    const res = await window.api.downloads.getAll();
    if (res.ok) set({ items: res.data, loaded: true });
  },

  setItems: (items) => {
    set({ items, loaded: true });
  },

  pause: async (id) => { await window.api.downloads.pause(id); },
  resume: async (id) => { await window.api.downloads.resume(id); },
  cancel: async (id) => { await window.api.downloads.cancel(id); },
  remove: async (id) => { await window.api.downloads.remove(id); },
  clearCompleted: async () => { await window.api.downloads.clearCompleted(); },
  showInFolder: async (savePath) => { await window.api.downloads.showInFolder(savePath); },
  openFile: async (savePath) => { await window.api.downloads.openFile(savePath); },

  activeCount: () => get().items.filter((d) => d.state === 'progressing' && !d.paused).length,
  hasAny: () => get().items.length > 0,
}));

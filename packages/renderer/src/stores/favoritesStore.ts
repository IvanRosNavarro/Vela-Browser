import { create } from 'zustand';
import type { Favorite } from '@vela/shared';
import { call } from '../lib/ipc';

export interface FavoritesState {
  favorites: Favorite[];
  loaded: boolean;

  hydrate: () => Promise<void>;
  add: (url: string, title: string, favicon?: string | null, parentId?: string | null) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reorder: (id: string, newPosition: string) => Promise<void>;
  move: (id: string, parentId: string | null, newPosition: string) => Promise<void>;
  updateTitle: (id: string, title: string) => Promise<void>;
  update: (id: string, data: { url?: string | null; title?: string; favicon?: string | null }) => Promise<void>;
  createFolder: (title: string, parentId?: string | null) => Promise<Favorite | null>;
  isFavorite: (url: string) => boolean;
  getForUrl: (url: string) => Favorite | null;
  getById: (id: string) => Favorite | null;
  getChildren: (parentId: string | null) => Favorite[];
  setFromEvent: (favorites: Favorite[]) => void;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: [],
  loaded: false,

  async hydrate() {
    const data = await call(() => window.api.favorites.list());
    set({ favorites: data, loaded: true });
  },

  async add(url, title, favicon, parentId) {
    await call(() => window.api.favorites.add({ url, title, favicon, parentId }));
  },

  async remove(id) {
    await call(() => window.api.favorites.remove({ id }));
  },

  async reorder(id, newPosition) {
    await call(() => window.api.favorites.reorder({ id, newPosition }));
  },

  async move(id, parentId, newPosition) {
    await call(() => window.api.favorites.move({ id, parentId, newPosition }));
  },

  async updateTitle(id, title) {
    await call(() => window.api.favorites.updateTitle({ id, title }));
  },

  async update(id, data) {
    await call(() => window.api.favorites.update({ id, ...data }));
  },

  async createFolder(title, parentId) {
    try {
      const res = await window.api.favorites.createFolder({ title, parentId });
      if (res.ok) return res.data;
      return null;
    } catch {
      return null;
    }
  },

  isFavorite(url) {
    return get().favorites.some((f) => f.type === 'bookmark' && f.url === url);
  },

  getForUrl(url) {
    return get().favorites.find((f) => f.type === 'bookmark' && f.url === url) ?? null;
  },

  getById(id) {
    return get().favorites.find((f) => f.id === id) ?? null;
  },

  getChildren(parentId) {
    const favs = get().favorites;
    return favs
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => (a.position < b.position ? -1 : 1));
  },

  setFromEvent(favorites) {
    set({ favorites, loaded: true });
  },
}));

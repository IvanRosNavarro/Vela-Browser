import { create } from 'zustand';
import type { Favorite } from '@vela/shared';
import { call } from '../lib/ipc';

// Estado de Favoritos en la shell: solo lo que necesita la estrella de la
// barra de direcciones. La gestión vive en vela://favorites.

export interface FavoritesState {
  favorites: Favorite[];
  loaded: boolean;

  hydrate: () => Promise<void>;
  add: (url: string, title: string, favicon?: string | null, parentId?: string | null) => Promise<void>;
  remove: (id: string) => Promise<void>;
  isFavorite: (url: string) => boolean;
  getForUrl: (url: string) => Favorite | null;
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

  isFavorite(url) {
    return get().favorites.some((f) => f.type === 'bookmark' && f.url === url);
  },

  getForUrl(url) {
    return get().favorites.find((f) => f.type === 'bookmark' && f.url === url) ?? null;
  },

  setFromEvent(favorites) {
    set({ favorites, loaded: true });
  },
}));

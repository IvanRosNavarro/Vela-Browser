import { create } from 'zustand';
import type {
  Profile,
  ProfileArchiveInput,
  ProfileCreateInput,
  ProfileReorderInput,
  ProfileUpdateInput,
} from '@vela/shared';
import { call } from '../lib/ipc';

export interface ProfilesState {
  /** Perfiles activos (no archivados), ordenados por position. */
  profiles: Profile[];
  /** Perfiles archivados. */
  archivedProfiles: Profile[];
  /** ID del perfil dueño de esta ventana (lo resuelve el bootstrap). */
  activeProfileId: string | null;
  loaded: boolean;

  hydrate: () => Promise<void>;
  reload: () => Promise<void>;
  setActiveLocal: (id: string | null) => void;

  create: (input: ProfileCreateInput) => Promise<Profile>;
  update: (input: ProfileUpdateInput) => Promise<Profile>;
  archive: (input: ProfileArchiveInput) => Promise<Profile>;
  delete: (id: string) => Promise<void>;
  reorder: (input: ProfileReorderInput) => Promise<Profile>;
  openInNewWindow: (id: string) => Promise<{ windowId: number }>;
  lock: (id: string) => Promise<void>;
}

async function fetchAllLists(): Promise<{
  active: Profile[];
  archived: Profile[];
}> {
  const [active, archived] = await Promise.all([
    call(() => window.api.profile.list()),
    call(() => window.api.profile.listArchived()),
  ]);
  return { active, archived };
}

export const useProfilesStore = create<ProfilesState>((set) => ({
  profiles: [],
  archivedProfiles: [],
  activeProfileId: null,
  loaded: false,

  async hydrate() {
    const [{ active, archived }, activeRes] = await Promise.all([
      fetchAllLists(),
      call(() => window.api.profile.getActive()),
    ]);
    set({
      profiles: active,
      archivedProfiles: archived,
      activeProfileId: activeRes.profileId,
      loaded: true,
    });
  },

  async reload() {
    const { active, archived } = await fetchAllLists();
    set({ profiles: active, archivedProfiles: archived });
  },

  setActiveLocal(id) {
    set({ activeProfileId: id });
  },

  async create(input) {
    return call(() => window.api.profile.create(input));
  },

  async update(input) {
    return call(() => window.api.profile.update(input));
  },

  async archive(input) {
    return call(() => window.api.profile.archive(input));
  },

  async delete(id) {
    await call(() => window.api.profile.delete({ id }));
    const { active, archived } = await fetchAllLists();
    set({ profiles: active, archivedProfiles: archived });
  },

  async reorder(input) {
    return call(() => window.api.profile.reorder(input));
  },

  async openInNewWindow(id) {
    return call(() => window.api.profile.openWindow({ id }));
  },

  async lock(id) {
    await call(() => window.api.profile.lock({ id }));
  },
}));

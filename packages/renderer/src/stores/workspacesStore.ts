import { create } from 'zustand';
import type {
  Workspace,
  WorkspaceArchiveInput,
  WorkspaceCreateInput,
  WorkspaceReorderInput,
  WorkspaceUpdateInput,
} from '@vela/shared';
import { call } from '../lib/ipc';

export interface WorkspacesState {
  workspaces: Workspace[];
  archivedWorkspaces: Workspace[];
  activeWorkspaceId: string | null;
  loaded: boolean;
  /** IDs de workspaces en orden MRU de activación (más reciente primero). */
  workspaceActivationOrder: string[];

  hydrate: () => Promise<void>;
  reload: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
  setActiveLocal: (id: string | null) => void;
  recordWorkspaceActivation: (id: string) => void;
  create: (input: WorkspaceCreateInput) => Promise<Workspace>;
  update: (input: WorkspaceUpdateInput) => Promise<Workspace>;
  archive: (input: WorkspaceArchiveInput) => Promise<Workspace>;
  delete: (id: string) => Promise<void>;
  reorder: (input: WorkspaceReorderInput) => Promise<Workspace>;
}

async function fetchAllLists(): Promise<{
  active: Workspace[];
  archived: Workspace[];
}> {
  const [list, listAll] = await Promise.all([
    call(() => window.api.workspaces.list()),
    call(() => window.api.workspaces.listAll()),
  ]);
  const archivedIds = new Set(list.map((w) => w.id));
  const archived = listAll.filter((w) => !archivedIds.has(w.id));
  return { active: list, archived };
}

export const useWorkspacesStore = create<WorkspacesState>((set, get) => ({
  workspaces: [],
  archivedWorkspaces: [],
  activeWorkspaceId: null,
  loaded: false,
  workspaceActivationOrder: [],

  async hydrate() {
    const [{ active, archived }, activeRes] = await Promise.all([
      fetchAllLists(),
      call(() => window.api.workspaces.getActive()),
    ]);
    set({
      workspaces: active,
      archivedWorkspaces: archived,
      activeWorkspaceId: activeRes.id,
      loaded: true,
    });
  },

  async reload() {
    const { active, archived } = await fetchAllLists();
    set({ workspaces: active, archivedWorkspaces: archived });
  },

  async setActive(id) {
    await call(() => window.api.workspaces.setActive({ id }));
    get().recordWorkspaceActivation(id);
    set({ activeWorkspaceId: id });
  },

  setActiveLocal(id) {
    if (id) get().recordWorkspaceActivation(id);
    set({ activeWorkspaceId: id });
  },

  recordWorkspaceActivation(id) {
    set((state) => {
      const order = state.workspaceActivationOrder.filter((w) => w !== id);
      return { workspaceActivationOrder: [id, ...order] };
    });
  },

  async create(input) {
    const ws = await call(() => window.api.workspaces.create(input));
    return ws;
  },

  async update(input) {
    return call(() => window.api.workspaces.update(input));
  },

  async archive(input) {
    return call(() => window.api.workspaces.archive(input));
  },

  async delete(id) {
    const wasActive = get().activeWorkspaceId === id;
    await call(() => window.api.workspaces.delete({ id }));
    const { active } = await fetchAllLists();
    set((state) => {
      const archived = state.archivedWorkspaces.filter((w) => w.id !== id);
      return {
        workspaces: active,
        archivedWorkspaces: archived,
        activeWorkspaceId: wasActive ? null : state.activeWorkspaceId,
      };
    });
    if (!wasActive) return;
    if (active.length > 0) {
      const next = active[0];
      if (next) {
        await get().setActive(next.id);
      }
      return;
    }
    // Lista vacía: creamos un workspace default y lo activamos.
    const fallback = await get().create({ name: 'Default' });
    const refreshed = await fetchAllLists();
    set({
      workspaces: refreshed.active,
      archivedWorkspaces: refreshed.archived,
    });
    await get().setActive(fallback.id);
  },

  async reorder(input) {
    return call(() => window.api.workspaces.reorder(input));
  },
}));

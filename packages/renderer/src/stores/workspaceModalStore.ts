import { create } from 'zustand';
import { useOverlayStore } from './overlayStore';

export type WorkspaceModalMode = 'create' | 'edit' | 'manage';

export interface WorkspaceModalState {
  open: boolean;
  mode: WorkspaceModalMode;
  editId: string | null;

  openCreate: () => Promise<void>;
  openEdit: (id: string) => Promise<void>;
  openManage: () => Promise<void>;
  close: () => void;
}

export const useWorkspaceModalStore = create<WorkspaceModalState>((set, get) => ({
  open: false,
  mode: 'create',
  editId: null,

  async openCreate() {
    if (!get().open) await useOverlayStore.getState().acquireAndWait();
    set({ open: true, mode: 'create', editId: null });
  },
  async openEdit(id) {
    if (!get().open) await useOverlayStore.getState().acquireAndWait();
    set({ open: true, mode: 'edit', editId: id });
  },
  async openManage() {
    if (!get().open) await useOverlayStore.getState().acquireAndWait();
    set({ open: true, mode: 'manage', editId: null });
  },
  close() {
    useOverlayStore.getState().release();
    set({ open: false, editId: null });
  },
}));

import { create } from 'zustand';
import { useOverlayStore } from './overlayStore';

export type ProfileModalMode = 'create' | 'edit' | 'manage';

export interface ProfileModalState {
  /** Modal principal (crear / editar / gestionar). */
  open: boolean;
  mode: ProfileModalMode;
  editId: string | null;

  /** Modal específico para configurar/quitar la contraseña maestra. */
  masterPasswordOpen: boolean;
  masterPasswordMode: 'add' | 'change' | 'remove';
  masterPasswordTargetId: string | null;

  /** Modal de unlock cuando hace falta contraseña para entrar al perfil. */
  unlockOpen: boolean;
  unlockTargetId: string | null;

  openCreate: () => Promise<void>;
  openEdit: (id: string) => Promise<void>;
  openManage: () => Promise<void>;
  close: () => void;

  openMasterPassword: (
    mode: 'add' | 'change' | 'remove',
    profileId: string,
  ) => void;
  closeMasterPassword: () => void;

  openUnlock: (profileId: string) => void;
  closeUnlock: () => void;
}

export const useProfileModalStore = create<ProfileModalState>((set, get) => ({
  open: false,
  mode: 'create',
  editId: null,

  masterPasswordOpen: false,
  masterPasswordMode: 'add',
  masterPasswordTargetId: null,

  unlockOpen: false,
  unlockTargetId: null,

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

  openMasterPassword(mode, profileId) {
    set({
      masterPasswordOpen: true,
      masterPasswordMode: mode,
      masterPasswordTargetId: profileId,
    });
  },
  closeMasterPassword() {
    set({ masterPasswordOpen: false, masterPasswordTargetId: null });
  },

  openUnlock(profileId) {
    set({ unlockOpen: true, unlockTargetId: profileId });
  },
  closeUnlock() {
    set({ unlockOpen: false, unlockTargetId: null });
  },
}));

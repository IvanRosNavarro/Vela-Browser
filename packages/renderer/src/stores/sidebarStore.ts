import { create } from 'zustand';

interface SidebarStore {
  pendingRenameId: string | null;
  setPendingRenameId: (id: string | null) => void;
}

export const useSidebarStore = create<SidebarStore>((set) => ({
  pendingRenameId: null,
  setPendingRenameId: (id) => set({ pendingRenameId: id }),
}));

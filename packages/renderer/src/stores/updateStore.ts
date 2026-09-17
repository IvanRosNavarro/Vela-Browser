import { create } from 'zustand';
import type { UpdateStatus } from '@vela/shared';

declare const __APP_VERSION__: string;

/**
 * El estado del actualizador lo mantiene `UpdateService` en main y llega
 * entero en `state:update-status-changed`. Aquí solo se guarda lo último
 * recibido y si la modal está abierta.
 */
interface UpdateStore {
  modalOpen: boolean;
  status: UpdateStatus;
  openModal: () => void;
  closeModal: () => void;
  setStatus: (status: UpdateStatus) => void;
  hydrate: () => Promise<void>;
}

const INITIAL_STATUS: UpdateStatus = {
  phase: 'idle',
  currentVersion: __APP_VERSION__,
  version: null,
  percent: 0,
  error: null,
  checkedAt: null,
  canInstall: true,
};

export const useUpdateStore = create<UpdateStore>((set) => ({
  modalOpen: false,
  status: INITIAL_STATUS,
  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),
  setStatus: (status) => set({ status }),
  hydrate: async () => {
    const res = await window.api.update.getStatus();
    if (res.ok) set({ status: res.data });
  },
}));

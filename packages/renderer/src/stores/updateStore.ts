import { create } from 'zustand';

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'dev-mode'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

interface UpdateStore {
  modalOpen: boolean;
  phase: UpdatePhase;
  availableVersion: string;
  downloadPercent: number;
  errorMessage: string;
  openModal: () => void;
  closeModal: () => void;
  setPhase: (
    phase: UpdatePhase,
    opts?: { version?: string; percent?: number; message?: string },
  ) => void;
}

export const useUpdateStore = create<UpdateStore>((set) => ({
  modalOpen: false,
  phase: 'idle',
  availableVersion: '',
  downloadPercent: 0,
  errorMessage: '',
  openModal: () => set({ modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),
  setPhase: (phase, opts = {}) =>
    set((s) => ({
      phase,
      availableVersion: opts.version ?? s.availableVersion,
      downloadPercent:
        opts.percent !== undefined
          ? opts.percent
          : phase === 'downloading'
            ? s.downloadPercent
            : 0,
      errorMessage: opts.message ?? s.errorMessage,
    })),
}));

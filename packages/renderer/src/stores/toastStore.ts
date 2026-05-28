import { create } from 'zustand';

export type ToastVariant = 'info' | 'warning' | 'error' | 'success';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  onClick?: () => void;
}

export interface ToastState {
  toasts: Toast[];
  push: (message: string, variant?: ToastVariant, onClick?: () => void) => string;
  dismiss: (id: string) => void;
}

const DEFAULT_TIMEOUT_MS = 4000;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push(message, variant = 'info', onClick?) {
    const id = globalThis.crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, message, variant, onClick }] }));
    globalThis.setTimeout(() => {
      get().dismiss(id);
    }, DEFAULT_TIMEOUT_MS);
    return id;
  },
  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

export function toast(message: string, variant?: ToastVariant, onClick?: () => void): void {
  useToastStore.getState().push(message, variant, onClick);
}

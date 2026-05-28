import { create } from 'zustand';

export interface AddressBarStoreState {
  focusRequestId: number;
  /** Prefijo que se escribirá en el input al enfocar (>, #, @, !alias…). null = sin prefijo */
  prefixOnFocus: string | null;
  requestFocus: (prefix?: string | null) => void;
}

export const useAddressBarStore = create<AddressBarStoreState>((set) => ({
  focusRequestId: 0,
  prefixOnFocus: null,
  requestFocus(prefix = null) {
    set((state) => ({
      focusRequestId: state.focusRequestId + 1,
      prefixOnFocus: prefix ?? null,
    }));
  },
}));

import { create } from 'zustand';

export type ScreenshotPhase =
  | 'idle'
  | 'mode-select'
  | 'region-select'
  | 'capturing'
  | 'editor';

interface ScreenshotState {
  phase: ScreenshotPhase;
  capturedDataUrl: string | null;
  /** Snapshot de la página capturado antes de ocultar el WCV.
   *  Se usa como fondo visual de todos los overlays de captura. */
  backgroundSnapshot: string | null;
  /** true mientras el dropdown del botón cámara está abierto */
  dropdownOpen: boolean;

  startCapture(snapshot?: string): void;
  /** Entra en fase 'capturing' manteniendo el overlay activo hasta que llegue openEditor. */
  startCapturing(): void;
  setRegionSelect(): void;
  openEditor(dataUrl: string): void;
  close(): void;
  openDropdown(snapshot?: string): void;
  closeDropdown(): void;
  /** true si el WCV debe estar oculto */
  needsOverlay(): boolean;
}

export const useScreenshotStore = create<ScreenshotState>((set, get) => ({
  phase: 'idle',
  capturedDataUrl: null,
  backgroundSnapshot: null,
  dropdownOpen: false,

  startCapture(snapshot) {
    set({ phase: 'mode-select', capturedDataUrl: null, backgroundSnapshot: snapshot ?? null });
  },

  startCapturing() {
    set({ phase: 'capturing', capturedDataUrl: null, backgroundSnapshot: null, dropdownOpen: false });
  },

  setRegionSelect() {
    set({ phase: 'region-select', dropdownOpen: false });
  },

  openEditor(dataUrl) {
    set({ phase: 'editor', capturedDataUrl: dataUrl, dropdownOpen: false });
  },

  close() {
    set({ phase: 'idle', capturedDataUrl: null, backgroundSnapshot: null, dropdownOpen: false });
  },

  openDropdown(snapshot) {
    set({ dropdownOpen: true, backgroundSnapshot: snapshot ?? null });
  },

  closeDropdown() {
    set({ dropdownOpen: false });
  },

  needsOverlay() {
    const { phase, dropdownOpen } = get();
    return phase !== 'idle' || dropdownOpen;
  },
}));

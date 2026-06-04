import { create } from 'zustand';
import { useRuntimeStore } from './runtimeStore';

export type DevToolsPanel =
  | 'color-picker'
  | 'json-formatter'
  | 'regex-tester'
  | 'text-diff'
  | 'converters';

export type ConverterTab = 'css' | 'base64' | 'hash' | 'uuid' | 'timestamp';

export interface PickedColor {
  hex: string;
  r: number;
  g: number;
  b: number;
}

interface DevToolsState {
  activePanel: DevToolsPanel | null;
  converterTab: ConverterTab;
  pickedColor: PickedColor | null;
  colorHistory: PickedColor[];

  open: (panel: DevToolsPanel, converterTab?: ConverterTab) => void;
  close: () => void;
  setConverterTab: (tab: ConverterTab) => void;
  startEyedropper: () => void;
  receiveColor: (color: PickedColor) => void;
}

export const useDevToolsStore = create<DevToolsState>((set, get) => ({
  activePanel: null,
  converterTab: 'css',
  pickedColor: null,
  colorHistory: [],

  open(panel, converterTab) {
    set({ activePanel: panel, converterTab: converterTab ?? get().converterTab });
  },

  close() {
    set({ activePanel: null });
  },

  setConverterTab(tab) {
    set({ converterTab: tab });
  },

  startEyedropper() {
    // Close the modal so the WCV is visible (no acquire while eyedropper is running).
    // A transparent fullscreen BrowserWindow handles the capture.
    set({ activePanel: null });
    const windowId = useRuntimeStore.getState().currentWindowId;
    if (windowId !== null) {
      void window.api.devtoolsHelpers.eyedropperShowWindow({ parentWindowId: windowId });
    }
  },

  receiveColor(color) {
    const prev = get().colorHistory;
    const next = [color, ...prev.filter((c) => c.hex !== color.hex)].slice(0, 12);
    set({ pickedColor: color, colorHistory: next, activePanel: 'color-picker' });
  },
}));

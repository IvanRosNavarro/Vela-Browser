import { create } from 'zustand';
import { DEVICE_PRESETS, type DevicePreset } from '@vela/shared';

export const DEVICE_TOOLBAR_HEIGHT = 36;

const DEFAULT_PRESET: DevicePreset = DEVICE_PRESETS.find((p) => p.id === 'iphone-12')!;

function readBgColor(): string {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue('--vela-bg-app')
      .trim() || '#1e1e1e'
  );
}

interface DeviceEmulationState {
  active: boolean;
  presetId: string | null;
  width: number;
  height: number;
  dpr: number;
  landscape: boolean;
  backgroundColor: string;
}

interface DeviceEmulationActions {
  activate: () => Promise<void>;
  deactivate: () => Promise<void>;
  applyPreset: (presetId: string) => Promise<void>;
  setDimensions: (width: number, height: number) => Promise<void>;
  setDpr: (dpr: number) => Promise<void>;
  toggleLandscape: () => Promise<void>;
}

async function sendEmulation(
  width: number,
  height: number,
  dpr: number,
  mobile: boolean,
  backgroundColor: string,
): Promise<void> {
  await window.api.devtools.setEmulation({ width, height, dpr, mobile, backgroundColor });
}

export const useDeviceEmulationStore = create<DeviceEmulationState & DeviceEmulationActions>(
  (set, get) => ({
    active: false,
    presetId: DEFAULT_PRESET.id,
    width: DEFAULT_PRESET.width,
    height: DEFAULT_PRESET.height,
    dpr: DEFAULT_PRESET.dpr,
    landscape: false,
    backgroundColor: '#1e1e1e',

    activate: async () => {
      const { width, height, dpr, landscape } = get();
      const w = landscape ? height : width;
      const h = landscape ? width : height;
      const backgroundColor = readBgColor();
      set({ active: true, backgroundColor });
      await sendEmulation(w, h, dpr, true, backgroundColor);
    },

    deactivate: async () => {
      set({ active: false });
      await window.api.devtools.clearEmulation();
    },

    applyPreset: async (presetId) => {
      const preset = DEVICE_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      const { landscape, backgroundColor } = get();
      const w = landscape ? preset.height : preset.width;
      const h = landscape ? preset.width : preset.height;
      set({ presetId, width: preset.width, height: preset.height, dpr: preset.dpr });
      await sendEmulation(w, h, preset.dpr, preset.mobile, backgroundColor);
    },

    setDimensions: async (width, height) => {
      set({ presetId: null, width, height });
      const { dpr, landscape, backgroundColor } = get();
      const w = landscape ? height : width;
      const h = landscape ? width : height;
      await sendEmulation(w, h, dpr, true, backgroundColor);
    },

    setDpr: async (dpr) => {
      set({ dpr });
      const { width, height, landscape, backgroundColor } = get();
      const w = landscape ? height : width;
      const h = landscape ? width : height;
      await sendEmulation(w, h, dpr, true, backgroundColor);
    },

    toggleLandscape: async () => {
      const { landscape, width, height, dpr, backgroundColor } = get();
      const newLandscape = !landscape;
      set({ landscape: newLandscape });
      const w = newLandscape ? height : width;
      const h = newLandscape ? width : height;
      await sendEmulation(w, h, dpr, true, backgroundColor);
    },
  }),
);

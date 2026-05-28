import { create } from 'zustand';
import { call } from '../lib/ipc';

export interface GestureBinding {
  pattern: string[];
  commandId: string;
  label: string;
}

interface GesturesState {
  enabled: boolean;
  showTrail: boolean;
  minSegmentPx: number;
  bindings: GestureBinding[];
  loaded: boolean;

  hydrate: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setShowTrail: (show: boolean) => Promise<void>;
  setMinSegmentPx: (px: number) => Promise<void>;
  setBinding: (pattern: string[], commandId: string, label: string) => Promise<void>;
  removeBinding: (pattern: string[]) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

export const DEFAULT_GESTURE_BINDINGS: GestureBinding[] = [
  { pattern: ['left'], commandId: 'nav.back', label: '← Navegar atrás' },
  { pattern: ['right'], commandId: 'nav.forward', label: '→ Navegar adelante' },
  { pattern: ['up'], commandId: 'internal.openNewTab', label: '↑ Nueva pestaña' },
  { pattern: ['down'], commandId: 'tab.closeActive', label: '↓ Cerrar pestaña' },
  { pattern: ['up', 'right'], commandId: 'tab.reopenClosed', label: '↑→ Reabrir última cerrada' },
  { pattern: ['down', 'left'], commandId: 'tabSwitcher.open', label: '↓← Abrir Tab Switcher' },
];

function patternKey(pattern: string[]): string {
  return pattern.join('+');
}

async function persist(key: string, value: unknown): Promise<void> {
  await call(() => window.api.settings.set({ key: key as 'gestures:enabled', value }));
}

export const useGesturesStore = create<GesturesState>((set, get) => ({
  enabled: true,
  showTrail: true,
  minSegmentPx: 60,
  bindings: DEFAULT_GESTURE_BINDINGS,
  loaded: false,

  async hydrate() {
    const all = await call(() => window.api.settings.getAll({}));
    const enabled = all['gestures:enabled'];
    const showTrail = all['gestures:show-trail'];
    const minSeg = all['gestures:min-segment-px'];
    const bindingsRaw = all['gestures:bindings'];

    set({
      enabled: typeof enabled === 'boolean' ? enabled : true,
      showTrail: typeof showTrail === 'boolean' ? showTrail : true,
      minSegmentPx: typeof minSeg === 'number' && isFinite(minSeg) && minSeg > 0 ? minSeg : 60,
      bindings: Array.isArray(bindingsRaw) && bindingsRaw.length > 0
        ? (bindingsRaw as GestureBinding[])
        : DEFAULT_GESTURE_BINDINGS,
      loaded: true,
    });
  },

  async setEnabled(enabled) {
    set({ enabled });
    await persist('gestures:enabled', enabled);
  },

  async setShowTrail(show) {
    set({ showTrail: show });
    await persist('gestures:show-trail', show);
  },

  async setMinSegmentPx(px) {
    const clamped = Math.max(40, Math.min(120, Math.round(px)));
    set({ minSegmentPx: clamped });
    await persist('gestures:min-segment-px', clamped);
  },

  async setBinding(pattern, commandId, label) {
    const key = patternKey(pattern);
    const next = get().bindings.filter(b => patternKey(b.pattern) !== key);
    next.push({ pattern, commandId, label });
    set({ bindings: next });
    await persist('gestures:bindings', next);
  },

  async removeBinding(pattern) {
    const key = patternKey(pattern);
    const next = get().bindings.filter(b => patternKey(b.pattern) !== key);
    set({ bindings: next });
    await persist('gestures:bindings', next);
  },

  async resetToDefaults() {
    set({
      bindings: DEFAULT_GESTURE_BINDINGS,
      enabled: true,
      showTrail: true,
      minSegmentPx: 60,
    });
    await Promise.all([
      persist('gestures:bindings', DEFAULT_GESTURE_BINDINGS),
      persist('gestures:enabled', true),
      persist('gestures:show-trail', true),
      persist('gestures:min-segment-px', 60),
    ]);
  },
}));

import { create } from 'zustand';
import { call } from '../lib/ipc';

export type ReaderFontFamily = 'serif' | 'sans-serif' | 'monospace';
export type ReaderTheme = 'light' | 'sepia' | 'dark';

export interface ReaderPrefs {
  fontFamily: ReaderFontFamily;
  fontSize: number;
  lineHeight: number;
  theme: ReaderTheme;
  alwaysOnDomains: string[];
}

export const READER_PREFS_DEFAULTS: ReaderPrefs = {
  fontFamily: 'serif',
  fontSize: 18,
  lineHeight: 1.7,
  theme: 'light',
  alwaysOnDomains: [],
};

export interface ReaderState extends ReaderPrefs {
  readableByTab: Record<string, boolean>;
  prefsLoaded: boolean;

  setReadable: (tabId: string, readable: boolean) => void;
  removeTab: (tabId: string) => void;
  hydratePrefs: () => Promise<void>;
  setFontFamily: (v: ReaderFontFamily) => Promise<void>;
  setFontSize: (v: number) => Promise<void>;
  setLineHeight: (v: number) => Promise<void>;
  setReaderTheme: (v: ReaderTheme) => Promise<void>;
  addAlwaysOnDomain: (domain: string) => Promise<void>;
  removeAlwaysOnDomain: (domain: string) => Promise<void>;
}

async function persist(key: string, value: unknown): Promise<void> {
  await call(() =>
    window.api.settings.set({ key: key as never, value }),
  );
}

function coerceString<T extends string>(raw: unknown, fallback: T, allowed: T[]): T {
  return typeof raw === 'string' && (allowed as string[]).includes(raw)
    ? (raw as T)
    : fallback;
}

function coerceNumber(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && isFinite(raw) ? raw : fallback;
}

export const useReaderStore = create<ReaderState>((set, get) => ({
  ...READER_PREFS_DEFAULTS,
  readableByTab: {},
  prefsLoaded: false,

  setReadable(tabId, readable) {
    set((s) => ({ readableByTab: { ...s.readableByTab, [tabId]: readable } }));
  },

  removeTab(tabId) {
    set((s) => {
      const next = { ...s.readableByTab };
      delete next[tabId];
      return { readableByTab: next };
    });
  },

  async hydratePrefs() {
    const all = await call(() => window.api.settings.getAll());
    const alwaysOnRaw = all['reader:always-on-domains'];
    let alwaysOnDomains: string[] = [];
    if (typeof alwaysOnRaw === 'string') {
      try {
        const parsed = JSON.parse(alwaysOnRaw) as unknown;
        if (Array.isArray(parsed)) alwaysOnDomains = parsed as string[];
      } catch {}
    } else if (Array.isArray(alwaysOnRaw)) {
      alwaysOnDomains = alwaysOnRaw as string[];
    }
    set({
      fontFamily: coerceString<ReaderFontFamily>(
        all['reader:font-family'],
        READER_PREFS_DEFAULTS.fontFamily,
        ['serif', 'sans-serif', 'monospace'],
      ),
      fontSize: coerceNumber(all['reader:font-size'], READER_PREFS_DEFAULTS.fontSize),
      lineHeight: coerceNumber(all['reader:line-height'], READER_PREFS_DEFAULTS.lineHeight),
      theme: coerceString<ReaderTheme>(
        all['reader:theme'],
        READER_PREFS_DEFAULTS.theme,
        ['light', 'sepia', 'dark'],
      ),
      alwaysOnDomains,
      prefsLoaded: true,
    });
  },

  async setFontFamily(v) {
    set({ fontFamily: v });
    await persist('reader:font-family', v);
  },

  async setFontSize(v) {
    set({ fontSize: v });
    await persist('reader:font-size', v);
  },

  async setLineHeight(v) {
    set({ lineHeight: v });
    await persist('reader:line-height', v);
  },

  async setReaderTheme(v) {
    set({ theme: v });
    await persist('reader:theme', v);
  },

  async addAlwaysOnDomain(domain) {
    const domains = [...get().alwaysOnDomains];
    if (domains.includes(domain)) return;
    const next = [...domains, domain];
    set({ alwaysOnDomains: next });
    await persist('reader:always-on-domains', next);
  },

  async removeAlwaysOnDomain(domain) {
    const next = get().alwaysOnDomains.filter((d) => d !== domain);
    set({ alwaysOnDomains: next });
    await persist('reader:always-on-domains', next);
  },
}));

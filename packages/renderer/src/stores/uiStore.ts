import { create } from 'zustand';
import {
  UI_SETTINGS_DEFAULTS,
  type SettingsKey,
  type SidebarMode,
  type UiSettings,
  type Theme,
} from '@vela/shared';
import { call } from '../lib/ipc';
import { themeManager } from '../shared-ui/theme';

export const SIDEBAR_WIDTH_COMPACT = 56;
export const SIDEBAR_WIDTH_NORMAL_DEFAULT = 240;
export const SIDEBAR_WIDTH_NORMAL_MIN = 120;
export const SIDEBAR_WIDTH_NORMAL_MAX = 480;

export interface UiState extends UiSettings {
  loaded: boolean;
  /** Ancho en px del sidebar en modo normal. Se persiste en settings al soltar el resize. */
  sidebarWidthNormal: number;
  /** La ventana está actualmente en pantalla completa. No persiste. */
  isFullscreen: boolean;
  /** La barra de direcciones tiene el input activo en modo edición. No persiste. */
  addressBarEditing: boolean;
  /** Temas custom del perfil. */
  customThemes: Theme[];
  /** CSS custom inyectado en todas las páginas internas. */
  customCss: string;

  hydrate: () => Promise<void>;
  setSidebarMode: (mode: SidebarMode) => Promise<void>;
  toggleSidebar: () => Promise<void>;
  setSidebarOpen: (open: boolean) => Promise<void>;
  setTheme: (themeId: string) => Promise<void>;
  setInheritedColorEnabled: (enabled: boolean) => Promise<void>;
  setIndentationGuides: (enabled: boolean) => Promise<void>;
  setFontFamily: (family: string) => Promise<void>;
  setFontSize: (size: number) => Promise<void>;
  setCompactDensity: (compact: boolean) => Promise<void>;
  setSidebarWidthNormal: (width: number) => void;
  persistSidebarWidth: () => Promise<void>;
  setFullscreen: (fullscreen: boolean) => void;
  setAddressBarEditing: (editing: boolean) => void;
  setCustomThemes: (themes: Theme[]) => Promise<void>;
  setCustomCss: (css: string) => Promise<void>;
}

async function persist(key: SettingsKey, value: unknown): Promise<void> {
  await call(() => window.api.settings.set({ key, value }));
}

function coerceSidebarMode(raw: unknown): SidebarMode {
  return raw === 'compact' ? 'compact' : 'normal';
}

function coerceTheme(raw: unknown): string {
  if (typeof raw === 'string' && raw.length > 0) return raw;
  return 'system';
}

function coerceBool(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback;
}

function coerceNumber(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && isFinite(raw) ? raw : fallback;
}

function coerceString(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && raw.length > 0 ? raw : fallback;
}

export const useUiStore = create<UiState>((set, get) => ({
  ...UI_SETTINGS_DEFAULTS,
  loaded: false,
  sidebarWidthNormal: window.api.init.sidebarWidth,
  isFullscreen: false,
  addressBarEditing: false,
  customThemes: [],
  customCss: '',

  async hydrate() {
    const all = await call(() => window.api.settings.getAll());
    const theme = coerceTheme(all['ui:theme']);
    const fontFamily = coerceString(all['ui:fontFamily'], UI_SETTINGS_DEFAULTS.fontFamily);
    const fontSize = coerceNumber(all['ui:fontSize'], UI_SETTINGS_DEFAULTS.fontSize);
    const customThemes: Theme[] = Array.isArray(all['ui:custom-themes'])
      ? (all['ui:custom-themes'] as Theme[])
      : [];
    const customCss = coerceString(all['ui:custom-css'], '');

    const sidebarWidthNormal = coerceNumber(
      all['ui:sidebarWidth'],
      SIDEBAR_WIDTH_NORMAL_DEFAULT,
    );

    const glassmorphism = coerceBool(all['ui:glassmorphism'], false);
    const glassmorphismIntensity = coerceNumber(all['ui:glassmorphism-intensity'], 60);
    const glassmorphismOpacity = coerceNumber(all['ui:glassmorphism-opacity'], 60);

    const next: UiSettings = {
      sidebarMode:
        all['ui:sidebarMode'] === null
          ? UI_SETTINGS_DEFAULTS.sidebarMode
          : coerceSidebarMode(all['ui:sidebarMode']),
      sidebarOpen:
        all['ui:sidebarOpen'] === null
          ? UI_SETTINGS_DEFAULTS.sidebarOpen
          : coerceBool(all['ui:sidebarOpen'], UI_SETTINGS_DEFAULTS.sidebarOpen),
      theme,
      inheritedColorEnabled:
        all['ui:inheritedColorEnabled'] === null
          ? UI_SETTINGS_DEFAULTS.inheritedColorEnabled
          : coerceBool(
              all['ui:inheritedColorEnabled'],
              UI_SETTINGS_DEFAULTS.inheritedColorEnabled,
            ),
      indentationGuides:
        all['ui:indentationGuides'] === null
          ? UI_SETTINGS_DEFAULTS.indentationGuides
          : coerceBool(
              all['ui:indentationGuides'],
              UI_SETTINGS_DEFAULTS.indentationGuides,
            ),
      fontFamily,
      fontSize,
      compactDensity: coerceBool(all['ui:compactDensity'], UI_SETTINGS_DEFAULTS.compactDensity),
      newtabButtonPos: all['ui:sidebar-newtab-pos'] === 'footer' ? 'footer' : 'above-tabs',
    };
    set({ ...next, sidebarWidthNormal, customThemes, customCss, loaded: true });

    // Aplicar tipografía, temas custom y glassmorphism desde uiStore.
    themeManager.applyFontFamily(fontFamily);
    themeManager.applyFontSize(fontSize);
    themeManager.setCustomThemes(customThemes);
    themeManager.applyCustomCss(customCss);
    themeManager.applyGlassmorphism(glassmorphism, glassmorphismIntensity, glassmorphismOpacity);
  },

  async setSidebarMode(mode) {
    set({ sidebarMode: mode });
    await persist('ui:sidebarMode', mode);
  },

  async toggleSidebar() {
    const next = !get().sidebarOpen;
    set({ sidebarOpen: next });
    await persist('ui:sidebarOpen', next);
  },

  async setSidebarOpen(open) {
    set({ sidebarOpen: open });
    await persist('ui:sidebarOpen', open);
  },

  async setTheme(themeId) {
    set({ theme: themeId });
    themeManager.setTheme(themeId);
    await persist('ui:theme', themeId);
  },

  async setInheritedColorEnabled(enabled) {
    set({ inheritedColorEnabled: enabled });
    await persist('ui:inheritedColorEnabled', enabled);
  },

  async setIndentationGuides(enabled) {
    set({ indentationGuides: enabled });
    await persist('ui:indentationGuides', enabled);
  },

  async setFontFamily(family) {
    set({ fontFamily: family });
    themeManager.applyFontFamily(family);
    await persist('ui:fontFamily', family);
  },

  async setFontSize(size) {
    set({ fontSize: size });
    themeManager.applyFontSize(size);
    await persist('ui:fontSize', size);
  },

  async setCompactDensity(compact) {
    set({ compactDensity: compact });
    await persist('ui:compactDensity', compact);
  },

  setSidebarWidthNormal(width) {
    const clamped = Math.max(
      SIDEBAR_WIDTH_NORMAL_MIN,
      Math.min(SIDEBAR_WIDTH_NORMAL_MAX, Math.round(width)),
    );
    set({ sidebarWidthNormal: clamped });
  },

  async persistSidebarWidth() {
    await persist('ui:sidebarWidth', get().sidebarWidthNormal);
  },

  setFullscreen(fullscreen) {
    set({ isFullscreen: fullscreen });
  },

  setAddressBarEditing(editing) {
    set({ addressBarEditing: editing });
  },

  async setCustomThemes(themes) {
    set({ customThemes: themes });
    themeManager.setCustomThemes(themes);
    await persist('ui:custom-themes', themes);
  },

  async setCustomCss(css) {
    set({ customCss: css });
    themeManager.applyCustomCss(css);
    await persist('ui:custom-css', css);
  },
}));

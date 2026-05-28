export type SidebarMode = 'compact' | 'normal';
export type NewTabButtonPos = 'above-tabs' | 'footer';

export interface UiSettings {
  sidebarMode: SidebarMode;
  sidebarOpen: boolean;
  /** ID del tema activo. 'system' sigue prefers-color-scheme; el resto son IDs de tema. */
  theme: string;
  inheritedColorEnabled: boolean;
  indentationGuides: boolean;
  fontFamily: string;
  fontSize: number;
  compactDensity: boolean;
  newtabButtonPos: NewTabButtonPos;
}

export const UI_SETTINGS_DEFAULTS: UiSettings = {
  sidebarMode: 'normal',
  sidebarOpen: true,
  theme: 'system',
  inheritedColorEnabled: true,
  indentationGuides: true,
  fontFamily: 'system',
  fontSize: 14,
  compactDensity: false,
  newtabButtonPos: 'above-tabs',
};

export type MruScope = 'workspace' | 'global';
export const MRU_SCOPE_DEFAULT: MruScope = 'workspace';

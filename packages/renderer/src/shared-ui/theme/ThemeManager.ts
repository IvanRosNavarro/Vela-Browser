import type { Theme } from '@vela/shared';
import { resolveTheme, BUILTIN_THEMES, getThemeById } from './themes';
import { THEME_VARS } from './variables';

const FONT_FAMILIES: Record<string, string> = {
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  inter: '"Inter", system-ui, sans-serif',
  'jetbrains-mono': '"JetBrains Mono", "Fira Code", monospace',
  'sf-pro': '"SF Pro Display", system-ui, sans-serif',
};

class ThemeManager {
  private currentThemeId = 'system';
  private materialSupported = false;
  private mediaQuery: MediaQueryList | null = null;
  private boundOnSchemeChange: (() => void) | null = null;
  private customThemes: Theme[] = [];
  private glassmorphismEnabled = false;
  private glassmorphismIntensity = 60;
  private glassmorphismOpacity = 60;

  initialize(): void {
    this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.boundOnSchemeChange = () => {
      if (this.currentThemeId === 'system') {
        this.applyById('system');
      }
    };
    this.mediaQuery.addEventListener('change', this.boundOnSchemeChange);

    void this.loadAndApply();
  }

  private async loadAndApply(): Promise<void> {
    try {
      const [themeRes, materialRes] = await Promise.all([
        window.api.settings.get({ key: 'ui:theme' }),
        window.api.runtime.getBackgroundMaterial(),
      ]);
      if (materialRes.ok) {
        this.materialSupported = materialRes.data.supported;
      }
      const themeId = themeRes.ok && typeof themeRes.data.value === 'string'
        ? themeRes.data.value
        : 'system';

      // Carga los temas custom antes de aplicar el tema activo.
      const customRes = await window.api.settings.get({ key: 'ui:custom-themes' });
      if (customRes.ok && Array.isArray(customRes.data.value)) {
        this.customThemes = customRes.data.value as Theme[];
      }

      this.applyById(themeId);

      const [fontFamilyRes, fontSizeRes, cssRes] = await Promise.all([
        window.api.settings.get({ key: 'ui:fontFamily' }),
        window.api.settings.get({ key: 'ui:fontSize' }),
        window.api.settings.get({ key: 'ui:custom-css' }),
      ]);
      if (fontFamilyRes.ok && typeof fontFamilyRes.data.value === 'string') {
        this.applyFontFamily(fontFamilyRes.data.value);
      }
      if (fontSizeRes.ok && typeof fontSizeRes.data.value === 'number') {
        this.applyFontSize(fontSizeRes.data.value);
      }
      if (cssRes.ok && typeof cssRes.data.value === 'string') {
        this.applyCustomCss(cssRes.data.value);
      }
    } catch {
      this.applyById('system');
    }
  }

  setMaterialSupported(supported: boolean): void {
    this.materialSupported = supported;
  }

  setTheme(themeId: string): void {
    this.currentThemeId = themeId;
    this.applyById(themeId);
  }

  setCustomThemes(themes: Theme[]): void {
    this.customThemes = themes;
    // Reaplicar si el tema activo es uno de los custom recién actualizados.
    if (this.customThemes.some((t) => t.id === this.currentThemeId)) {
      this.applyById(this.currentThemeId);
    }
  }

  private findTheme(id: string): Theme | undefined {
    return getThemeById(id) ?? this.customThemes.find((t) => t.id === id);
  }

  private applyById(themeId: string): void {
    this.currentThemeId = themeId;
    const prefersDark = this.mediaQuery?.matches ?? false;
    const theme = resolveTheme(themeId, prefersDark, this.customThemes);
    this.applyTheme(theme);
  }

  applyGlassmorphism(enabled: boolean, intensity: number, opacity: number): void {
    this.glassmorphismEnabled = enabled;
    this.glassmorphismIntensity = intensity;
    this.glassmorphismOpacity = opacity;
    const root = document.documentElement;
    if (enabled) {
      const blurPx = Math.round(16 + (intensity / 100) * 8);
      // opacity slider: 0 = muy transparente (0.20), 100 = casi sólido (0.85)
      const bgOpacity = (0.20 + (opacity / 100) * 0.65).toFixed(2);
      root.style.setProperty('--sidebar-backdrop-filter', `blur(${blurPx}px) saturate(1.8)`);
      root.style.setProperty('--sidebar-background-opacity', bgOpacity);
      // html transparente para que el acrílico del SO pase a través hasta sidebar y titlebar.
      root.style.setProperty('--vela-html-bg', 'transparent');
      // Overlay DWM de Windows: transparente para que el acrylic pase por los botones nativ
      if (window.api?.platform === 'win32') {
        const symbolColor = getComputedStyle(root).getPropertyValue('--vela-titlebar-fg').trim() || '#e0e0e0';
        void window.api.window.updateTitleBarOverlay({ color: '#00000000', symbolColor });
      }
    } else {
      // Restaurar los valores propios del tema (Midnight/Nord/etc. definen su propio blur).
      const prefersDark = this.mediaQuery?.matches ?? false;
      const theme = resolveTheme(this.currentThemeId, prefersDark, this.customThemes);
      root.style.setProperty('--sidebar-backdrop-filter', theme.variables['--sidebar-backdrop-filter'] ?? 'none');
      root.style.setProperty('--sidebar-background-opacity', theme.variables['--sidebar-background-opacity'] ?? '1');
      root.style.removeProperty('--vela-html-bg');
      // Restaurar color del overlay DWM al del tema activo.
      if (window.api?.platform === 'win32') {
        const computed = getComputedStyle(root);
        const color = computed.getPropertyValue('--vela-titlebar-bg').trim() || '#1a1a1a';
        const symbolColor = computed.getPropertyValue('--vela-titlebar-fg').trim() || '#e0e0e0';
        void window.api.window.updateTitleBarOverlay({ color, symbolColor });
      }
    }
  }

  applyTheme(theme: Theme): void {
    const root = document.documentElement;

    Object.entries(theme.variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Si el toggle de glassmorphism está activo, sobreescribir con los valores de intensidad.
    // Si está inactivo, los valores propios del tema (ya aplicados arriba) permanecen.
    if (this.glassmorphismEnabled) {
      const blurPx = Math.round(16 + (this.glassmorphismIntensity / 100) * 8);
      const bgOpacity = (0.20 + (this.glassmorphismOpacity / 100) * 0.65).toFixed(2);
      root.style.setProperty('--sidebar-backdrop-filter', `blur(${blurPx}px) saturate(1.8)`);
      root.style.setProperty('--sidebar-background-opacity', bgOpacity);
      root.style.setProperty('--vela-html-bg', 'transparent');
    } else {
      root.style.removeProperty('--vela-html-bg');
    }

    document.body.dataset.theme = theme.id;

    if (window.api.platform === 'win32') {
      const computed = getComputedStyle(root);
      const symbolColor = computed.getPropertyValue('--vela-titlebar-fg').trim()
        || theme.variables['--vela-titlebar-fg']
        || '#e0e0e0';
      // Con glassmorphism activo el overlay DWM debe ser transparente para que el acrílico
      // pase también por el área de botones nativos min/max/close.
      const color = this.glassmorphismEnabled
        ? '#00000000'
        : (computed.getPropertyValue('--vela-titlebar-bg').trim()
            || theme.variables['--vela-titlebar-bg']
            || '#1a1a1a');
      void window.api.window.updateTitleBarOverlay({ color, symbolColor });
    }
  }

  applyFontFamily(familyKey: string): void {
    const value = FONT_FAMILIES[familyKey] ?? FONT_FAMILIES['system']!;
    document.documentElement.style.setProperty('--vela-font-family', value);
  }

  applyFontSize(size: number): void {
    const clamped = Math.max(12, Math.min(18, size));
    document.documentElement.style.setProperty('--vela-font-size', `${clamped}px`);
  }

  applyCustomCss(css: string): void {
    const existing = document.getElementById('vela-custom-css');
    if (existing) existing.remove();
    if (!css.trim()) return;
    const style = document.createElement('style');
    style.id = 'vela-custom-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  getCurrentTheme(): Theme {
    const prefersDark = this.mediaQuery?.matches ?? false;
    return resolveTheme(this.currentThemeId, prefersDark, this.customThemes);
  }

  listThemes(): Theme[] {
    return [...BUILTIN_THEMES, ...this.customThemes];
  }

  /**
   * Verifica que todas las variables base de THEME_VARS estén definidas en el
   * tema. Útil para validación de temas custom antes de aplicarlos.
   */
  validate(theme: Theme): { valid: boolean; missingVars: string[] } {
    const expectedKeys = Object.keys(THEME_VARS);
    const missingVars = expectedKeys.filter((k) => !(k in theme.variables));
    return { valid: missingVars.length === 0, missingVars };
  }

  destroy(): void {
    if (this.mediaQuery && this.boundOnSchemeChange) {
      this.mediaQuery.removeEventListener('change', this.boundOnSchemeChange);
    }
  }
}

export const themeManager = new ThemeManager();

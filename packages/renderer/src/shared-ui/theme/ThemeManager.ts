import type { Theme } from '@vela/shared';
import { ThemeManager as KitThemeManager, type TitleBarColors } from 'vela-kit/theme';

/**
 * Overlay DWM de Windows: el kit emite los colores tras aplicar un tema o
 * cambiar el glassmorphism y Vela los envía al marco nativo solo en win32.
 */
function syncTitleBarOverlay(colors: TitleBarColors): void {
  if (window.api?.platform !== 'win32') return;
  void window.api.window.updateTitleBarOverlay(colors);
}

/**
 * ThemeManager de vela-kit (ADR 0106) más lo propio del navegador: al
 * inicializar lee de los ajustes el tema activo, los temas custom, la
 * tipografía y el CSS custom, y consulta el soporte de material del SO.
 */
class VelaThemeManager extends KitThemeManager {
  private materialSupported = false;

  constructor() {
    super({ onTitleBarColors: syncTitleBarOverlay, customCssElementId: 'vela-custom-css' });
  }

  override initialize(): void {
    super.initialize();
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
        this.setCustomThemes(customRes.data.value as Theme[]);
      }

      this.setTheme(themeId);

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
      this.setTheme('system');
    }
  }

  setMaterialSupported(supported: boolean): void {
    this.materialSupported = supported;
  }
}

export const themeManager = new VelaThemeManager();

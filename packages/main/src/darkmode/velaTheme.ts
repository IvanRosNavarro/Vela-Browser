import { resolveTheme } from 'vela-kit/theme/themes';
import type { Theme } from '@vela/shared';

function isTheme(value: unknown): value is Theme {
  if (!value || typeof value !== 'object') return false;
  const t = value as Partial<Theme>;
  return (
    typeof t.id === 'string' &&
    (t.type === 'light' || t.type === 'dark') &&
    typeof t.variables === 'object' &&
    t.variables !== null
  );
}

/**
 * ¿Es oscuro el tema activo de Vela? Resuelve igual que el `ThemeManager` del
 * renderer (`resolveTheme` de vela-kit): `system` sigue al SO, un id
 * desconocido cae al base claro u oscuro según el SO, y los temas custom se
 * buscan en `ui:custom-themes`.
 *
 * @param themeId valor de `ui:theme` (null si no se ha elegido: `system`).
 * @param customThemes valor de `ui:custom-themes` tal cual se leyó.
 * @param prefersDark `nativeTheme.shouldUseDarkColors`, que es lo que ve el
 *   `prefers-color-scheme` del renderer.
 */
export function isVelaThemeDark(
  themeId: unknown,
  customThemes: unknown,
  prefersDark: boolean,
): boolean {
  const id = typeof themeId === 'string' && themeId !== '' ? themeId : 'system';
  const customs = Array.isArray(customThemes) ? customThemes.filter(isTheme) : [];
  return resolveTheme(id, prefersDark, customs).type === 'dark';
}

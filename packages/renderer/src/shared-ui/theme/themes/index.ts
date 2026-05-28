import type { Theme } from '@vela/shared';
import { darkTheme } from './dark';
import { lightTheme } from './light';
import { midnightTheme } from './midnight';
import { nordTheme } from './nord';
import { draculaTheme } from './dracula';
import { solarizedDarkTheme } from './solarized-dark';
import { solarizedLightTheme } from './solarized-light';
import { gruvboxDarkTheme } from './gruvbox-dark';

export { darkTheme, lightTheme, midnightTheme, nordTheme, draculaTheme, solarizedDarkTheme, solarizedLightTheme, gruvboxDarkTheme };

export const BUILTIN_THEMES: Theme[] = [
  lightTheme,
  darkTheme,
  midnightTheme,
  nordTheme,
  draculaTheme,
  solarizedDarkTheme,
  solarizedLightTheme,
  gruvboxDarkTheme,
];

const themeMap = new Map<string, Theme>(BUILTIN_THEMES.map((t) => [t.id, t]));

export function getThemeById(id: string): Theme | undefined {
  return themeMap.get(id);
}

export function resolveTheme(
  themeId: string,
  prefersDark: boolean,
  customThemes: Theme[] = [],
): Theme {
  if (themeId === 'system') {
    return prefersDark ? darkTheme : lightTheme;
  }
  return (
    themeMap.get(themeId) ??
    customThemes.find((t) => t.id === themeId) ??
    (prefersDark ? darkTheme : lightTheme)
  );
}

import { describe, expect, it } from 'vitest';
import {
  DARKMODE_DEFAULTS,
  coerceDarkModeSettings,
  darkModeHostOf,
  darkModeTabState,
  findSiteOverride,
  isDarkModeEffective,
  isPageBackgroundDark,
  normalizeHostInput,
  parseCssColor,
  resolveDarkMode,
  toggleSiteOverride,
  type DarkModeSettings,
} from '@vela/shared';
import { isVelaThemeDark } from './velaTheme';

function settings(over: Partial<DarkModeSettings> = {}): DarkModeSettings {
  return { ...DARKMODE_DEFAULTS, ...over };
}

describe('darkModeHostOf', () => {
  it('solo admite http(s)', () => {
    expect(darkModeHostOf('https://Example.com/a?b')).toBe('example.com');
    expect(darkModeHostOf('http://example.com.')).toBe('example.com');
    expect(darkModeHostOf('vela://newtab')).toBeNull();
    expect(darkModeHostOf('about:blank')).toBeNull();
    expect(darkModeHostOf('file:///C:/a.html')).toBeNull();
    expect(darkModeHostOf('chrome-extension://abc/popup.html')).toBeNull();
    expect(darkModeHostOf('view-source:https://example.com')).toBeNull();
    expect(darkModeHostOf('no es una url')).toBeNull();
  });
});

describe('resolveDarkMode', () => {
  const url = 'https://www.example.com/';

  it('desactivado por defecto', () => {
    expect(resolveDarkMode(url, settings(), true).applies).toBe(false);
  });

  it('"siempre" aplica con cualquier tema', () => {
    expect(resolveDarkMode(url, settings({ mode: 'always' }), false).applies).toBe(true);
  });

  it('"seguir el tema" depende de que el tema de Vela sea oscuro', () => {
    const s = settings({ mode: 'follow-theme' });
    expect(resolveDarkMode(url, s, true).applies).toBe(true);
    expect(resolveDarkMode(url, s, false).applies).toBe(false);
  });

  it('nunca aplica a páginas internas', () => {
    expect(resolveDarkMode('vela://settings', settings({ mode: 'always' }), true).applies).toBe(false);
  });

  it('las excepciones mandan sobre el modo y valen para subdominios', () => {
    const s = settings({ mode: 'always', sites: { 'example.com': false } });
    expect(resolveDarkMode(url, s, true)).toEqual({
      applies: false,
      fromOverride: true,
      host: 'www.example.com',
    });
    expect(resolveDarkMode('https://other.com', s, true).applies).toBe(true);
  });

  it('manda la excepción más específica', () => {
    const s = settings({ sites: { 'example.com': false, 'docs.example.com': true } });
    expect(resolveDarkMode('https://docs.example.com', s, false).applies).toBe(true);
    expect(resolveDarkMode('https://www.example.com', s, false).applies).toBe(false);
  });

  it('una excepción "siempre oscuro" fuerza aunque la web ya sea oscura', () => {
    const s = settings({ sites: { 'example.com': true } });
    expect(darkModeTabState(url, s, false)).toMatchObject({ enabled: true, forced: true });
    expect(darkModeTabState(url, settings({ mode: 'always' }), false)).toMatchObject({
      enabled: true,
      forced: false,
    });
  });
});

describe('findSiteOverride', () => {
  it('no baja hasta el TLD ni trata las IP como dominios', () => {
    expect(findSiteOverride('example.com', { com: true })).toBeNull();
    expect(findSiteOverride('10.0.0.5', { '0.0.5': true })).toBeNull();
    expect(findSiteOverride('10.0.0.5', { '10.0.0.5': true })).toEqual({ host: '10.0.0.5', value: true });
  });
});

describe('isDarkModeEffective', () => {
  it('se retira en webs ya oscuras salvo que el usuario lo fuerce', () => {
    expect(isDarkModeEffective({ applies: true, fromOverride: false, host: 'a.com' }, true)).toBe(false);
    expect(isDarkModeEffective({ applies: true, fromOverride: true, host: 'a.com' }, true)).toBe(true);
    expect(isDarkModeEffective({ applies: true, fromOverride: false, host: 'a.com' }, false)).toBe(true);
  });
});

describe('toggleSiteOverride', () => {
  const url = 'https://www.example.com/page';

  it('con el modo desactivado, activa el sitio y al volver borra la excepción', () => {
    const first = toggleSiteOverride(url, settings(), false);
    expect(first).toEqual({ sites: { 'www.example.com': true }, applies: true, host: 'www.example.com' });
    const second = toggleSiteOverride(url, settings({ sites: first!.sites }), false);
    expect(second).toEqual({ sites: {}, applies: false, host: 'www.example.com' });
  });

  it('con "siempre", desactiva el sitio', () => {
    const r = toggleSiteOverride(url, settings({ mode: 'always' }), false);
    expect(r?.sites).toEqual({ 'www.example.com': false });
    expect(r?.applies).toBe(false);
  });

  it('respeta la excepción de un dominio padre', () => {
    const s = settings({ sites: { 'example.com': true } });
    const r = toggleSiteOverride(url, s, false);
    expect(r?.sites).toEqual({ 'example.com': true, 'www.example.com': false });
    const back = toggleSiteOverride(url, settings({ sites: r!.sites }), false);
    expect(back?.sites).toEqual({ 'example.com': true });
    expect(back?.applies).toBe(true);
  });

  it('en una web ya oscura parte de lo que se ve y guarda la excepción', () => {
    const r = toggleSiteOverride(url, settings({ mode: 'always' }), false, true);
    expect(r).toEqual({ sites: { 'www.example.com': true }, applies: true, host: 'www.example.com' });
    const back = toggleSiteOverride(url, settings({ mode: 'always', sites: r!.sites }), false, true);
    expect(back).toEqual({ sites: {}, applies: false, host: 'www.example.com' });
  });

  it('no hace nada en páginas internas', () => {
    expect(toggleSiteOverride('vela://newtab', settings(), false)).toBeNull();
  });
});

describe('coerceDarkModeSettings / normalizeHostInput', () => {
  it('descarta valores corruptos y acota la intensidad', () => {
    expect(
      coerceDarkModeSettings({
        mode: 'nope',
        brightness: 999,
        contrast: 'x',
        sites: { 'HTTPS://Example.com/x': true, 'mal host!': false, 'a.com': 'si' },
      }),
    ).toEqual({ mode: 'off', brightness: 150, contrast: 100, sites: { 'example.com': true } });
    expect(coerceDarkModeSettings({ sites: ['a.com'] }).sites).toEqual({});
  });

  it('normaliza lo que escribe el usuario', () => {
    expect(normalizeHostInput('  Example.COM ')).toBe('example.com');
    expect(normalizeHostInput('https://sub.example.com/ruta?q=1')).toBe('sub.example.com');
    expect(normalizeHostInput('')).toBeNull();
    expect(normalizeHostInput('no válido')).toBeNull();
    expect(normalizeHostInput('vela://settings')).toBeNull();
  });
});

describe('isPageBackgroundDark', () => {
  const base = { bodyBackground: null, htmlBackground: null, rootColorScheme: null, prefersDark: false };

  it('parsea colores computados', () => {
    expect(parseCssColor('rgb(18, 18, 18)')).toEqual({ r: 18, g: 18, b: 18, a: 1 });
    expect(parseCssColor('rgba(0, 0, 0, 0)')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseCssColor('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseCssColor('transparent')).toBeNull();
  });

  it('usa el fondo del body y, si es transparente, el del html', () => {
    expect(isPageBackgroundDark({ ...base, bodyBackground: 'rgb(18, 18, 18)' })).toBe(true);
    expect(isPageBackgroundDark({ ...base, bodyBackground: 'rgb(255, 255, 255)' })).toBe(false);
    expect(
      isPageBackgroundDark({
        ...base,
        bodyBackground: 'rgba(0, 0, 0, 0)',
        htmlBackground: 'rgb(30, 30, 35)',
      }),
    ).toBe(true);
  });

  it('sin fondos decide el color-scheme de la raíz', () => {
    expect(isPageBackgroundDark({ ...base, bodyBackground: 'rgba(0, 0, 0, 0)' })).toBe(false);
    expect(isPageBackgroundDark({ ...base, rootColorScheme: 'dark' })).toBe(true);
    expect(isPageBackgroundDark({ ...base, rootColorScheme: 'only dark' })).toBe(true);
    expect(isPageBackgroundDark({ ...base, rootColorScheme: 'light dark' })).toBe(false);
    expect(isPageBackgroundDark({ ...base, rootColorScheme: 'light dark', prefersDark: true })).toBe(true);
    expect(isPageBackgroundDark({ ...base, rootColorScheme: 'normal', prefersDark: true })).toBe(false);
  });
});

describe('isVelaThemeDark', () => {
  it('resuelve builtin, system y custom', () => {
    expect(isVelaThemeDark('dark', null, false)).toBe(true);
    expect(isVelaThemeDark('light', null, true)).toBe(false);
    expect(isVelaThemeDark('nord', null, false)).toBe(true);
    expect(isVelaThemeDark('system', null, true)).toBe(true);
    expect(isVelaThemeDark(null, null, false)).toBe(false);
    const custom = [{ id: 'mio', name: 'Mío', type: 'dark', builtin: false, variables: {} }];
    expect(isVelaThemeDark('mio', custom, false)).toBe(true);
    // Un id desconocido cae al base del SO, igual que en el renderer.
    expect(isVelaThemeDark('borrado', custom, false)).toBe(false);
  });
});

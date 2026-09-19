/**
 * Modo oscuro forzado para las webs (Dark Reader).
 *
 * Lógica pura, sin DOM ni zod: la usan el main (qué pestaña lo lleva), el
 * preload de las pestañas (detección de webs ya oscuras) y la página de
 * ajustes (normalizar el host que escribe el usuario). El preload la importa
 * por subruta (`@vela/shared/darkmode/policy`).
 */

/** `darkmode:web`. */
export type DarkModeMode = 'off' | 'always' | 'follow-theme';

export const DARKMODE_MODES: readonly DarkModeMode[] = ['off', 'always', 'follow-theme'];

/**
 * Excepciones por sitio (`darkmode:sites`): host → `true` (siempre oscuro) o
 * `false` (nunca). Una entrada vale también para sus subdominios; manda la
 * más específica.
 */
export type DarkModeSiteOverrides = Record<string, boolean>;

export interface DarkModeSettings {
  mode: DarkModeMode;
  /** Brillo de Dark Reader, en %. */
  brightness: number;
  /** Contraste de Dark Reader, en %. */
  contrast: number;
  sites: DarkModeSiteOverrides;
}

export const DARKMODE_INTENSITY_MIN = 50;
export const DARKMODE_INTENSITY_MAX = 150;

export const DARKMODE_DEFAULTS: DarkModeSettings = {
  mode: 'off',
  brightness: 100,
  contrast: 100,
  sites: {},
};

/** Lo que el main le dice al preload de una pestaña. */
export interface DarkModeTabState {
  /** Aplicar Dark Reader a este documento. */
  enabled: boolean;
  /**
   * El usuario lo ha pedido expresamente para este sitio: se aplica aunque la
   * web ya parezca oscura.
   */
  forced: boolean;
  brightness: number;
  contrast: number;
}

export const DARKMODE_TAB_STATE_OFF: DarkModeTabState = {
  enabled: false,
  forced: false,
  brightness: DARKMODE_DEFAULTS.brightness,
  contrast: DARKMODE_DEFAULTS.contrast,
};

function clampIntensity(raw: unknown, fallback: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback;
  return Math.round(Math.min(DARKMODE_INTENSITY_MAX, Math.max(DARKMODE_INTENSITY_MIN, raw)));
}

/**
 * Convierte lo leído de `settings_profile` (ya deserializado) en ajustes
 * válidos. Un valor corrupto o de otra versión cae al valor por defecto.
 */
export function coerceDarkModeSettings(raw: {
  mode?: unknown;
  brightness?: unknown;
  contrast?: unknown;
  sites?: unknown;
}): DarkModeSettings {
  const mode = DARKMODE_MODES.includes(raw.mode as DarkModeMode)
    ? (raw.mode as DarkModeMode)
    : DARKMODE_DEFAULTS.mode;
  const sites: DarkModeSiteOverrides = {};
  if (raw.sites && typeof raw.sites === 'object' && !Array.isArray(raw.sites)) {
    for (const [host, value] of Object.entries(raw.sites as Record<string, unknown>)) {
      const normalized = normalizeHostInput(host);
      if (normalized && typeof value === 'boolean') sites[normalized] = value;
    }
  }
  return {
    mode,
    brightness: clampIntensity(raw.brightness, DARKMODE_DEFAULTS.brightness),
    contrast: clampIntensity(raw.contrast, DARKMODE_DEFAULTS.contrast),
    sites,
  };
}

/**
 * Host de una URL a la que se puede aplicar el modo oscuro, o null. Solo
 * http(s): las páginas `vela://`, `about:`, `file:`, `view-source:`,
 * `chrome-extension:`… quedan fuera.
 */
export function darkModeHostOf(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  return host === '' ? null : host;
}

const HOST_RE = /^(?:\[[0-9a-f:.]+\]|[a-z0-9-]+(?:\.[a-z0-9-]+)*)$/;

/**
 * Normaliza lo que el usuario escribe en la lista de excepciones: acepta un
 * host suelto (`example.com`), con esquema o ruta (`https://example.com/a`).
 * Devuelve null si no parece un host.
 */
export function normalizeHostInput(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === '' || trimmed.length > 253) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  const host = darkModeHostOf(withScheme);
  if (!host || !HOST_RE.test(host)) return null;
  return host;
}

/**
 * Excepción aplicable a `host`: la del propio host o, si no hay, la del
 * dominio padre más cercano (`www.example.com` → `example.com`).
 */
export function findSiteOverride(
  host: string,
  sites: DarkModeSiteOverrides,
): { host: string; value: boolean } | null {
  const own = sites[host];
  if (typeof own === 'boolean') return { host, value: own };
  // Una IP no tiene dominios padre.
  if (host.startsWith('[') || /^[\d.]+$/.test(host)) return null;
  let candidate = host;
  for (;;) {
    const dot = candidate.indexOf('.');
    if (dot === -1) return null;
    candidate = candidate.slice(dot + 1);
    // No bajamos hasta un TLD suelto ("com").
    if (!candidate.includes('.')) return null;
    const value = sites[candidate];
    if (typeof value === 'boolean') return { host: candidate, value };
  }
}

/** Lo que dicta el modo global, sin mirar las excepciones. */
function modeApplies(mode: DarkModeMode, velaThemeIsDark: boolean): boolean {
  if (mode === 'always') return true;
  if (mode === 'follow-theme') return velaThemeIsDark;
  return false;
}

export interface DarkModeDecision {
  applies: boolean;
  /** Decidido por una excepción del usuario (no por el modo global). */
  fromOverride: boolean;
  host: string | null;
}

/** ¿Lleva modo oscuro esta URL con estos ajustes y este tema de Vela? */
export function resolveDarkMode(
  url: string,
  settings: DarkModeSettings,
  velaThemeIsDark: boolean,
): DarkModeDecision {
  const host = darkModeHostOf(url);
  if (!host) return { applies: false, fromOverride: false, host: null };
  const override = findSiteOverride(host, settings.sites);
  if (override) return { applies: override.value, fromOverride: true, host };
  return { applies: modeApplies(settings.mode, velaThemeIsDark), fromOverride: false, host };
}

/** Estado que se envía al preload para una URL. */
export function darkModeTabState(
  url: string,
  settings: DarkModeSettings,
  velaThemeIsDark: boolean,
): DarkModeTabState {
  const decision = resolveDarkMode(url, settings, velaThemeIsDark);
  return {
    enabled: decision.applies,
    forced: decision.applies && decision.fromOverride,
    brightness: settings.brightness,
    contrast: settings.contrast,
  };
}

/**
 * ¿Se ve oscura por Dark Reader la página? Coincide con la decisión de los
 * ajustes salvo cuando la web ya era oscura por sí misma: entonces Dark
 * Reader se retira, a menos que el usuario lo haya forzado para el sitio.
 */
export function isDarkModeEffective(decision: DarkModeDecision, pageIsNativelyDark: boolean): boolean {
  return decision.applies && (decision.fromOverride || !pageIsNativelyDark);
}

/**
 * Alterna el modo oscuro en el sitio de `url`, partiendo de lo que el usuario
 * ve ahora (`isDarkModeEffective`). Devuelve las excepciones nuevas y si el
 * sitio queda oscuro, o null si la URL no admite modo oscuro.
 *
 * La excepción se guarda para el host exacto. Si lo que se pide coincide
 * con lo que ya dictaría el resto (la excepción de un dominio padre o, si no
 * hay, el modo global), la del host se borra en lugar de guardarse: así la
 * lista solo contiene diferencias reales. La excepción sí se guarda al
 * activarlo en una web que ya es oscura, porque sin ella la detección lo
 * volvería a retirar.
 */
export function toggleSiteOverride(
  url: string,
  settings: DarkModeSettings,
  velaThemeIsDark: boolean,
  pageIsNativelyDark = false,
): { sites: DarkModeSiteOverrides; applies: boolean; host: string } | null {
  const current = resolveDarkMode(url, settings, velaThemeIsDark);
  if (!current.host) return null;
  const host = current.host;
  const next = !isDarkModeEffective(current, pageIsNativelyDark);
  const sites: DarkModeSiteOverrides = { ...settings.sites };
  delete sites[host];
  // Tras quitar la del host, puede seguir mandando la de un dominio padre.
  const inherited = findSiteOverride(host, sites);
  const withoutOwn = inherited
    ? inherited.value
    : modeApplies(settings.mode, velaThemeIsDark) && !pageIsNativelyDark;
  if (withoutOwn !== next) sites[host] = next;
  return { sites, applies: next, host };
}

// ─── Detección de webs que ya son oscuras ───────────────────────────────────

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parsea un color computado (`rgb(…)`/`rgba(…)`, sintaxis con comas o espacios). */
export function parseCssColor(value: string): RgbaColor | null {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(
    value.trim(),
  );
  if (!m) return null;
  let a = 1;
  if (m[4] !== undefined) {
    a = m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
  }
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  if (![r, g, b, a].every(Number.isFinite)) return null;
  return { r, g, b, a };
}

/** Luminancia relativa WCAG (0 = negro, 1 = blanco). */
export function relativeLuminance({ r, g, b }: RgbaColor): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Por debajo de esto un fondo se considera oscuro (≈ #616161 o más oscuro). */
export const DARK_BACKGROUND_LUMINANCE = 0.12;

/**
 * ¿La página ya es oscura por sí misma? Se decide con el color de fondo
 * computado de `<body>` y `<html>` (el primero que no sea transparente) y,
 * si ambos lo son, con el `color-scheme` de la raíz, que es lo que pinta el
 * lienzo. Una web sin fondo ni `color-scheme: dark` se ve blanca.
 */
export function isPageBackgroundDark(input: {
  bodyBackground: string | null;
  htmlBackground: string | null;
  rootColorScheme: string | null;
  /** `prefers-color-scheme: dark` tal como lo ve la página. */
  prefersDark: boolean;
}): boolean {
  for (const raw of [input.bodyBackground, input.htmlBackground]) {
    if (!raw) continue;
    const color = parseCssColor(raw);
    if (!color || color.a < 0.5) continue;
    return relativeLuminance(color) < DARK_BACKGROUND_LUMINANCE;
  }
  const tokens = (input.rootColorScheme ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t !== '' && t !== 'only');
  if (!tokens.includes('dark')) return false;
  // `light dark`: el navegador elige según la preferencia del sistema.
  return tokens[0] === 'dark' || !tokens.includes('light') || input.prefersDark;
}

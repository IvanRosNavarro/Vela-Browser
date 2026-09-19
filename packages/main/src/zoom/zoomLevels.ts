/**
 * Lógica pura del zoom de página: escalones, clave por sitio y el mapa
 * persistido. Sin Electron, para poder probarla con vitest.
 */

/** Escalones de Chrome (25 %–500 %). El 33 % y el 67 % se guardan redondeados. */
export const ZOOM_FACTORS: readonly number[] = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5,
];

export const MIN_ZOOM_FACTOR = 0.25;
export const MAX_ZOOM_FACTOR = 5;
export const DEFAULT_ZOOM_FACTOR = 1;

/** Tolerancia al comparar factores: Chromium los guarda como niveles log. */
const EPSILON = 0.001;
/**
 * Tolerancia al buscar el escalón vecino: un factor a menos de medio punto de
 * un escalón cuenta como ese escalón (1/3 ≈ 33 %), para que el paso siguiente
 * no sea un no-op visual.
 */
const STEP_EPSILON = 0.005;

export function isDefaultZoom(factor: number): boolean {
  return Math.abs(factor - DEFAULT_ZOOM_FACTOR) < EPSILON;
}

export function zoomFactorsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < EPSILON;
}

/** Acota al rango válido y redondea a centésimas. NaN/∞ → 100 %. */
export function normalizeZoomFactor(factor: number): number {
  if (!Number.isFinite(factor) || factor <= 0) return DEFAULT_ZOOM_FACTOR;
  const clamped = Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, factor));
  return Math.round(clamped * 100) / 100;
}

/**
 * Siguiente escalón por encima de `current`. Si `current` no es un escalón
 * (p. ej. lo fijó otra vía), salta al primero mayor, como Chrome.
 */
export function nextZoomFactor(current: number): number {
  for (const f of ZOOM_FACTORS) {
    if (f > current + STEP_EPSILON) return f;
  }
  return MAX_ZOOM_FACTOR;
}

/** Escalón anterior por debajo de `current`. */
export function previousZoomFactor(current: number): number {
  for (let i = ZOOM_FACTORS.length - 1; i >= 0; i--) {
    const f = ZOOM_FACTORS[i]!;
    if (f < current - STEP_EPSILON) return f;
  }
  return MIN_ZOOM_FACTOR;
}

export function stepZoomFactor(current: number, direction: 'in' | 'out'): number {
  return direction === 'in' ? nextZoomFactor(current) : previousZoomFactor(current);
}

/**
 * Clave con la que se recuerda el zoom de una URL.
 *
 * - http/https: el hostname tal cual (sin puerto ni `www.` retirado). Es la
 *   misma granularidad que el `HostZoomMap` de Chromium, que propaga el zoom
 *   entre las pestañas de la sesión con el mismo host: si usáramos otra, lo
 *   guardado y lo que muestra Chromium divergirían.
 * - vela:// → `vela://<página>` (vela://settings, vela://newtab…), para no
 *   chocar con un host web homónimo.
 * - Todo lo demás (file:, about:, data:, chrome-extension:…) → null: se puede
 *   hacer zoom, pero no se recuerda.
 */
export function zoomKeyForUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    return host.length > 0 ? host : null;
  }
  if (parsed.protocol === 'vela:') {
    const page = parsed.hostname.toLowerCase();
    return page.length > 0 ? `vela://${page}` : null;
  }
  return null;
}

export type ZoomMap = Record<string, number>;

/** Lee el mapa persistido; descarta entradas corruptas en vez de fallar. */
export function parseZoomMap(raw: string | null | undefined): ZoomMap {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
  const out: ZoomMap = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) continue;
    const factor = normalizeZoomFactor(value);
    if (!isDefaultZoom(factor)) out[key] = factor;
  }
  return out;
}

/** Devuelve un mapa nuevo con la entrada fijada; 100 % borra la entrada. */
export function withZoomEntry(map: ZoomMap, key: string, factor: number): ZoomMap {
  const next: ZoomMap = { ...map };
  const normalized = normalizeZoomFactor(factor);
  if (isDefaultZoom(normalized)) delete next[key];
  else next[key] = normalized;
  return next;
}

export function zoomPercent(factor: number): number {
  return Math.round(factor * 100);
}

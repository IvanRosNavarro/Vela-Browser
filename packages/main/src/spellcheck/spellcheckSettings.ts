import { spellcheckLanguagesValueSchema } from '@vela/shared';

/**
 * Lógica pura del corrector ortográfico: lectura de los ajustes del perfil y
 * resolución de idiomas contra los diccionarios disponibles. Sin Electron,
 * para poder probarla con vitest.
 */

export const SPELLCHECK_ENABLED_KEY = 'spellcheck:enabled';
export const SPELLCHECK_LANGUAGES_KEY = 'spellcheck:languages';

/** Último recurso si ni el usuario ni el sistema aportan un idioma usable. */
const FALLBACK_LANGUAGE = 'en-US';

/** Valor crudo (JSON) de `spellcheck:enabled`. Por defecto, activo. */
export function parseSpellcheckEnabled(raw: string | null): boolean {
  if (raw === null) return true;
  try {
    return JSON.parse(raw) !== false;
  } catch {
    return true;
  }
}

/**
 * Valor crudo (JSON) de `spellcheck:languages`. Devuelve null cuando el
 * usuario no ha elegido idiomas (o el valor está corrupto): se siguen los del
 * sistema.
 */
export function parseSpellcheckLanguages(raw: string | null): string[] | null {
  if (raw === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = spellcheckLanguagesValueSchema.safeParse(value);
  if (!parsed.success || parsed.data === null) return null;
  return parsed.data;
}

/**
 * Busca en `available` el diccionario que corresponde a `code`. Primero por
 * coincidencia exacta (sin distinguir mayúsculas), luego por idioma base: los
 * códigos del sistema traen región (`es-ES`) y en Linux hay diccionarios sin
 * ella (`es`) o con otra (`es-MX`).
 */
export function matchSpellcheckLanguage(
  code: string,
  available: readonly string[],
): string | null {
  const wanted = code.trim().toLowerCase().replace(/_/g, '-');
  if (!wanted) return null;
  const exact = available.find((a) => a.toLowerCase() === wanted);
  if (exact) return exact;
  const base = wanted.split('-')[0] ?? wanted;
  const sameBase = available.find((a) => a.toLowerCase() === base);
  if (sameBase) return sameBase;
  return available.find((a) => a.toLowerCase().startsWith(`${base}-`)) ?? null;
}

function mapToAvailable(codes: readonly string[], available: readonly string[]): string[] {
  const out: string[] = [];
  for (const code of codes) {
    const match = matchSpellcheckLanguage(code, available);
    if (match && !out.includes(match)) out.push(match);
  }
  return out;
}

/**
 * Idiomas que se pasan a `session.setSpellCheckerLanguages`: los elegidos por
 * el usuario (o, si no eligió, los preferidos del sistema) que tengan
 * diccionario en esta máquina. Los idiomas elegidos pueden venir de otro
 * dispositivo vía sync con un diccionario que aquí no existe: se descartan en
 * silencio y, si no queda ninguno, se cae a los del sistema.
 */
export function resolveSpellcheckLanguages(
  requested: readonly string[] | null,
  systemPreferred: readonly string[],
  available: readonly string[],
): string[] {
  if (available.length === 0) return [];
  if (requested) {
    const chosen = mapToAvailable(requested, available);
    if (chosen.length > 0) return chosen;
  }
  const system = mapToAvailable(systemPreferred, available);
  if (system.length > 0) return system;
  const fallback = matchSpellcheckLanguage(FALLBACK_LANGUAGE, available);
  return fallback ? [fallback] : [available[0] as string];
}

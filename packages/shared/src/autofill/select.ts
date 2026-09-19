import { monthFromName } from './card';
import { normalizeHint } from './fields';

/**
 * Elección de la opción de un <select> (país, provincia, mes, año) a partir
 * del valor guardado. Funciones puras sobre `{ value, text }`.
 */

export interface SelectOptionLike {
  value: string;
  text: string;
}

function norm(s: string): string {
  return normalizeHint(s).replace(/[^a-z0-9 ]/g, '').trim();
}

/** Índice de la primera opción cuyo value o texto normalizado está en `wanted`. */
function findExact(options: readonly SelectOptionLike[], wanted: ReadonlySet<string>): number {
  for (let i = 0; i < options.length; i++) {
    const o = options[i]!;
    if (wanted.has(norm(o.value)) || wanted.has(norm(o.text))) return i;
  }
  return -1;
}

// ─── Países ──────────────────────────────────────────────────────────────────

let countryIndex: Array<{ code: string; names: string[] }> | null = null;

/**
 * Tabla ISO 3166-1 alfa-2 → nombres en español e inglés, generada con
 * `Intl.DisplayNames` (disponible en Chromium y Node): evita mantener una
 * lista de países a mano.
 */
function getCountryIndex(): Array<{ code: string; names: string[] }> {
  if (countryIndex) return countryIndex;
  const out: Array<{ code: string; names: string[] }> = [];
  let es: Intl.DisplayNames | null = null;
  let en: Intl.DisplayNames | null = null;
  try {
    es = new Intl.DisplayNames(['es'], { type: 'region', fallback: 'none' });
    en = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  } catch {
    countryIndex = out;
    return out;
  }
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      let nameEs: string | undefined;
      let nameEn: string | undefined;
      try {
        nameEs = es.of(code);
        nameEn = en.of(code);
      } catch {
        continue;
      }
      if (!nameEs && !nameEn) continue;
      const names = [nameEs, nameEn].filter((n): n is string => !!n && n !== code);
      if (names.length === 0) continue;
      out.push({ code, names });
    }
  }
  countryIndex = out;
  return out;
}

// Nombres habituales que no coinciden con los de Intl.
const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  'espana': 'ES', 'spain': 'ES',
  'usa': 'US', 'eeuu': 'US', 'ee uu': 'US', 'united states of america': 'US', 'estados unidos de america': 'US',
  'uk': 'GB', 'great britain': 'GB', 'england': 'GB', 'inglaterra': 'GB',
  'holanda': 'NL', 'holland': 'NL',
};

/** Código ISO alfa-2 de un país escrito como código o nombre (es/en). */
export function countryCode(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  const n = norm(s);
  const alias = COUNTRY_ALIASES[n];
  if (alias) return alias;
  for (const entry of getCountryIndex()) {
    if (entry.names.some((name) => norm(name) === n)) return entry.code;
  }
  return null;
}

/** Todas las formas aceptables de un país: código ISO y nombres es/en. */
function countryForms(raw: string): Set<string> {
  const forms = new Set<string>([norm(raw)]);
  const code = countryCode(raw);
  if (code) {
    forms.add(code.toLowerCase());
    const entry = getCountryIndex().find((e) => e.code === code);
    entry?.names.forEach((name) => forms.add(norm(name)));
    for (const [alias, aliasCode] of Object.entries(COUNTRY_ALIASES)) {
      if (aliasCode === code) forms.add(alias);
    }
  }
  forms.delete('');
  return forms;
}

/** Opción de país que corresponde al valor guardado, o -1. */
export function matchCountryOption(options: readonly SelectOptionLike[], country: string): number {
  if (!country.trim()) return -1;
  return findExact(options, countryForms(country));
}

// ─── Provincia / región ──────────────────────────────────────────────────────

/**
 * Opción de provincia o región: coincidencia exacta normalizada y, si no la
 * hay, la única opción cuyo texto empieza por el valor (o al revés).
 */
export function matchRegionOption(options: readonly SelectOptionLike[], region: string): number {
  const n = norm(region);
  if (!n) return -1;
  const exact = findExact(options, new Set([n]));
  if (exact >= 0) return exact;
  const partial: number[] = [];
  options.forEach((o, i) => {
    const t = norm(o.text);
    if (t && (t.startsWith(n) || n.startsWith(t))) partial.push(i);
  });
  return partial.length === 1 ? partial[0]! : -1;
}

// ─── Mes y año ───────────────────────────────────────────────────────────────

/** Mes (1–12) que representa una opción: "07", "7", "Julio", "07 - Julio". */
function optionMonth(o: SelectOptionLike): number | null {
  for (const raw of [o.value, o.text]) {
    const s = raw.trim();
    if (/^\d{1,2}$/.test(s)) {
      const m = Number(s);
      if (m >= 1 && m <= 12) return m;
      continue;
    }
    const lead = /^(\d{1,2})\b/.exec(s);
    if (lead) {
      const m = Number(lead[1]);
      if (m >= 1 && m <= 12) return m;
    }
    const byName = monthFromName(s.split(/[\s\-–(]/)[0] ?? '');
    if (byName) return byName;
  }
  return null;
}

export function matchMonthOption(options: readonly SelectOptionLike[], month: number): number {
  return options.findIndex((o) => optionMonth(o) === month);
}

/** Opción de año: "2027" o "27". */
export function matchYearOption(options: readonly SelectOptionLike[], year: number): number {
  const full = String(year);
  const short = String(year % 100).padStart(2, '0');
  return options.findIndex((o) => {
    const v = o.value.trim();
    const t = o.text.trim();
    return v === full || t === full || v === short || t === short;
  });
}

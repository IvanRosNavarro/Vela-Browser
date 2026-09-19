import type { CardBrand } from '../types/autofill';

/**
 * Utilidades puras de tarjetas: normalización, Luhn, marca, enmascarado y
 * formato de caducidad. Sin dependencias: las importa también el preload de
 * las pestañas web.
 */

/** Deja solo los dígitos ("4111 1111-1111 1111" → "4111111111111111"). */
export function normalizeCardNumber(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Algoritmo de Luhn sobre un número de 12 a 19 dígitos. */
export function luhnValid(raw: string): boolean {
  const digits = normalizeCardNumber(raw);
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function inRange(prefix: string, len: number, min: number, max: number): boolean {
  if (prefix.length < len) return false;
  const n = Number(prefix.slice(0, len));
  return n >= min && n <= max;
}

/** Marca por el prefijo (IIN) del número. */
export function detectCardBrand(raw: string): CardBrand {
  const n = normalizeCardNumber(raw);
  if (!n) return 'unknown';
  if (/^4/.test(n)) return 'visa';
  if (/^3[47]/.test(n)) return 'amex';
  if (inRange(n, 2, 51, 55) || inRange(n, 4, 2221, 2720)) return 'mastercard';
  if (/^(36|38|39)/.test(n) || inRange(n, 3, 300, 305) || /^3095/.test(n)) return 'diners';
  if (inRange(n, 4, 3528, 3589)) return 'jcb';
  if (/^(6011|65)/.test(n) || inRange(n, 3, 644, 649) || inRange(n, 6, 622126, 622925)) return 'discover';
  if (/^62/.test(n)) return 'unionpay';
  if (/^(5018|5020|5038|5893|6304|6759|676[1-3]|50|5[6-9]|6)/.test(n)) return 'maestro';
  return 'unknown';
}

export const CARD_BRAND_LABELS: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  maestro: 'Maestro',
  unknown: 'Tarjeta',
};

/** Últimos cuatro dígitos (o menos si el número es más corto). */
export function cardLast4(raw: string): string {
  return normalizeCardNumber(raw).slice(-4);
}

/** "•••• 1234". */
export function maskCardNumber(raw: string): string {
  const last4 = cardLast4(raw);
  return last4 ? `•••• ${last4}` : '••••';
}

// ─── Caducidad ───────────────────────────────────────────────────────────────

export interface ExpiryFormat {
  /** Cifras del año: 2 ("27") o 4 ("2027"). */
  yearDigits: 2 | 4;
  /** Separador entre mes y año: "/", " / ", "-" o "" (MMYY). */
  separator: string;
}

export const DEFAULT_EXPIRY_FORMAT: ExpiryFormat = { yearDigits: 2, separator: '/' };

/**
 * Deduce el formato de un campo de caducidad único (`cc-exp`) a partir de su
 * placeholder y su maxLength. Admite placeholders en español e inglés:
 * "MM/AA", "MM / YY", "MM/AAAA", "mm-yyyy", "MMYY".
 */
export function expiryFormatFor(field: { placeholder?: string | null; maxLength?: number | null }): ExpiryFormat {
  const ph = (field.placeholder ?? '').toUpperCase();
  const max = field.maxLength != null && field.maxLength > 0 ? field.maxLength : null;

  let yearDigits: 2 | 4 = 2;
  if (/(YYYY|AAAA)/.test(ph)) yearDigits = 4;
  else if (/(YY|AA)/.test(ph)) yearDigits = 2;
  else if (max === 7 || max === 6 || max === 9) yearDigits = 4;

  let separator = '/';
  const sepMatch = /MM(\s*[/\-.]?\s*)(?:YY|AA)/.exec(ph);
  if (sepMatch) {
    separator = sepMatch[1] ?? '/';
  } else if (max === 4 || (max === 6 && yearDigits === 4)) {
    separator = '';
  }
  // Un maxLength explícito manda sobre un separador que no cabría.
  if (max != null && 2 + separator.length + yearDigits > max) {
    separator = max >= 2 + 1 + yearDigits ? '/' : '';
  }
  return { yearDigits, separator };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Mes y año a texto según el formato del campo ("07/27", "07/2027", "0727"). */
export function formatExpiry(month: number, year: number, format: ExpiryFormat = DEFAULT_EXPIRY_FORMAT): string {
  const yy = format.yearDigits === 4 ? String(year) : pad2(year % 100);
  return `${pad2(month)}${format.separator}${yy}`;
}

/** Año de 2 o 4 cifras normalizado a 4 cifras (siglo XXI). */
export function normalizeExpYear(year: number): number {
  if (year >= 1000) return year;
  return 2000 + (year % 100);
}

/**
 * Interpreta una caducidad escrita en un único campo. Acepta "07/27",
 * "7/2027", "07 / 27", "07-27", "0727" y "072027". Devuelve null si no es
 * una fecha válida.
 */
export function parseExpiry(raw: string): { month: number; year: number } | null {
  const s = raw.trim();
  if (!s) return null;
  let month: number;
  let year: number;
  const sep = /^(\d{1,2})\s*[/\-.\s]\s*(\d{2}|\d{4})$/.exec(s);
  if (sep) {
    month = Number(sep[1]);
    year = Number(sep[2]);
  } else if (/^\d{4}$/.test(s) || /^\d{6}$/.test(s)) {
    month = Number(s.slice(0, 2));
    year = Number(s.slice(2));
  } else {
    return null;
  }
  if (month < 1 || month > 12) return null;
  return { month, year: normalizeExpYear(year) };
}

/** Mes suelto ("7", "07", "julio", "Jul") → 1–12, o null. */
export function parseExpMonth(raw: string): number | null {
  const s = raw.trim();
  if (/^\d{1,2}$/.test(s)) {
    const m = Number(s);
    return m >= 1 && m <= 12 ? m : null;
  }
  return monthFromName(s);
}

/** Año suelto ("27", "2027") → 4 cifras, o null. */
export function parseExpYear(raw: string): number | null {
  const s = raw.trim();
  if (!/^(\d{2}|\d{4})$/.test(s)) return null;
  return normalizeExpYear(Number(s));
}

const MONTH_NAMES: ReadonlyArray<ReadonlyArray<string>> = [
  ['enero', 'ene', 'january', 'jan'],
  ['febrero', 'feb', 'february'],
  ['marzo', 'mar', 'march'],
  ['abril', 'abr', 'april', 'apr'],
  ['mayo', 'may'],
  ['junio', 'jun', 'june'],
  ['julio', 'jul', 'july'],
  ['agosto', 'ago', 'august', 'aug'],
  ['septiembre', 'setiembre', 'sep', 'sept', 'set', 'september'],
  ['octubre', 'oct', 'october'],
  ['noviembre', 'nov', 'november'],
  ['diciembre', 'dic', 'december', 'dec'],
];

/** Nombre de mes en español o inglés (completo o abreviado) → 1–12. */
export function monthFromName(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/\.$/, '');
  if (!s) return null;
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (MONTH_NAMES[i]!.includes(s)) return i + 1;
  }
  return null;
}

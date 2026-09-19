import type { AutofillKind } from '../types/autofill';

/**
 * Clasificación de campos de formulario para el autorrelleno de direcciones y
 * tarjetas. Función pura: recibe una descripción del campo (no el elemento
 * DOM) para poder probarla sin navegador y usarla desde el preload.
 *
 * Orden de preferencia:
 *   1. El atributo `autocomplete` estándar (WHATWG), si nombra un tipo conocido.
 *   2. Heurística sobre name, id, etiqueta, placeholder y aria-label, en
 *      español e inglés.
 */

export type AutofillFieldType =
  | 'name'
  | 'given-name'
  | 'family-name'
  | 'organization'
  | 'street-address'
  | 'address-line1'
  | 'address-line2'
  | 'address-level2'
  | 'address-level1'
  | 'postal-code'
  | 'country'
  | 'tel'
  | 'email'
  | 'cc-name'
  | 'cc-number'
  | 'cc-exp'
  | 'cc-exp-month'
  | 'cc-exp-year'
  /** Código de seguridad: se detecta solo para no tocarlo nunca. */
  | 'cc-csc';

export interface FieldDescriptor {
  /** 'input' | 'select' | 'textarea' (en minúsculas). */
  tagName: string;
  /** Atributo type del input ('' para select/textarea). */
  type?: string | null;
  autocomplete?: string | null;
  name?: string | null;
  id?: string | null;
  /** Texto de la <label> asociada, aria-label o aria-labelledby. */
  label?: string | null;
  placeholder?: string | null;
}

const ADDRESS_TYPES: ReadonlySet<AutofillFieldType> = new Set<AutofillFieldType>([
  'name', 'given-name', 'family-name', 'organization', 'street-address',
  'address-line1', 'address-line2', 'address-level2', 'address-level1',
  'postal-code', 'country', 'tel', 'email',
]);

const CARD_TYPES: ReadonlySet<AutofillFieldType> = new Set<AutofillFieldType>([
  'cc-name', 'cc-number', 'cc-exp', 'cc-exp-month', 'cc-exp-year', 'cc-csc',
]);

/** A qué tipo de entrada pertenece un campo. */
export function fieldKind(type: AutofillFieldType): AutofillKind {
  return CARD_TYPES.has(type) ? 'card' : 'address';
}

export function isAddressFieldType(type: AutofillFieldType): boolean {
  return ADDRESS_TYPES.has(type);
}

export function isCardFieldType(type: AutofillFieldType): boolean {
  return CARD_TYPES.has(type);
}

// ─── autocomplete ────────────────────────────────────────────────────────────

const AUTOCOMPLETE_MAP: Readonly<Record<string, AutofillFieldType>> = {
  'name': 'name',
  'given-name': 'given-name',
  'family-name': 'family-name',
  'organization': 'organization',
  'street-address': 'street-address',
  'address-line1': 'address-line1',
  'address-line2': 'address-line2',
  'address-level2': 'address-level2',
  'address-level1': 'address-level1',
  'postal-code': 'postal-code',
  'country': 'country',
  'country-name': 'country',
  'tel': 'tel',
  'tel-national': 'tel',
  'email': 'email',
  'cc-name': 'cc-name',
  'cc-given-name': 'cc-name',
  'cc-number': 'cc-number',
  'cc-exp': 'cc-exp',
  'cc-exp-month': 'cc-exp-month',
  'cc-exp-year': 'cc-exp-year',
  'cc-csc': 'cc-csc',
};

/**
 * Tokens de `autocomplete` que dicen explícitamente que el campo es OTRA cosa
 * (credenciales, códigos de un solo uso…). Ante ellos no se aplica heurística.
 */
const AUTOCOMPLETE_OTHER = new Set([
  'username', 'current-password', 'new-password', 'one-time-code',
  'nickname', 'bday', 'bday-day', 'bday-month', 'bday-year', 'sex', 'url',
  'photo', 'language', 'impp', 'transaction-amount', 'transaction-currency',
  'cc-type', 'cc-family-name', 'cc-additional-name', 'additional-name',
  'honorific-prefix', 'honorific-suffix', 'organization-title',
  'address-level3', 'address-level4', 'address-line3',
  'tel-country-code', 'tel-area-code', 'tel-local', 'tel-local-prefix',
  'tel-local-suffix', 'tel-extension',
]);

/** Tipo nombrado por el atributo autocomplete; 'other' si nombra otra cosa. */
export function typeFromAutocomplete(raw: string | null | undefined): AutofillFieldType | 'other' | null {
  if (!raw) return null;
  const tokens = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const last = tokens[tokens.length - 1]!;
  if (last === 'off' || last === 'on') return null;
  const mapped = AUTOCOMPLETE_MAP[last];
  if (mapped) return mapped;
  if (AUTOCOMPLETE_OTHER.has(last)) return 'other';
  return null;
}

/**
 * Sección del campo según `autocomplete` ("section-envio", "shipping",
 * "billing"): permite rellenar solo el bloque del campo enfocado cuando un
 * formulario tiene dirección de envío y de facturación.
 */
export function autocompleteSection(raw: string | null | undefined): string {
  if (!raw) return '';
  const tokens = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return tokens
    .filter((t) => t.startsWith('section-') || t === 'shipping' || t === 'billing')
    .join(' ');
}

// ─── Heurística ──────────────────────────────────────────────────────────────

/** Minúsculas, sin tildes y con separadores normalizados a espacio. */
export function normalizeHint(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_\-.[\]:*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tipos de input que nunca se rellenan. */
const SKIPPED_INPUT_TYPES = new Set([
  'hidden', 'password', 'submit', 'button', 'reset', 'checkbox', 'radio',
  'file', 'image', 'range', 'color', 'search', 'date', 'datetime-local',
  'time', 'week',
]);

// Campos de login o de búsqueda con nombres que chocarían con los de dirección
// ("user_email", "search_city"…). Se descartan antes de la heurística.
const EXCLUDE_RE = /\b(user ?name|usuario|login|nick|captcha|coupon|cupon|promo|search|buscar|busqueda|query|otp|pin|iban|swift|bic|dni|nif|nie|cif|vat|tax|password|contrasena)\b/;

interface Rule {
  type: AutofillFieldType;
  re: RegExp;
}

// El orden importa: las de tarjeta van primero ("nombre del titular de la
// tarjeta" contiene "nombre"), y "nombre y apellidos" antes que "apellidos".
const RULES: readonly Rule[] = [
  { type: 'cc-csc', re: /\b(cvv|cvc|cvv2|cvc2|csc|cvn|cid)\b|security ?code|codigo (de )?seguridad|card ?verification|verification ?(code|value)/ },
  { type: 'cc-number', re: /card ?(number|no|num|nr)\b|cardnumber|\bcc ?(num|number|no)\b|ccnum|credit ?card|debit ?card|numero (de (la )?)?tarjeta|num (de )?tarjeta|\bpan\b/ },
  { type: 'cc-name', re: /card ?holder|holder ?name|name ?on ?(the )?card|(name|nombre).*(card|tarjeta)|(card|tarjeta).*(name|nombre|titular)|titular|\bcc ?name\b/ },
  { type: 'cc-exp-month', re: /(exp|expir\w*|venc\w*|cad\w*).*\b(month|mes|mm)\b|\b(month|mes)\b.*(exp|venc|cad)|\bcc ?(exp )?month\b|\bexp ?mm\b/ },
  { type: 'cc-exp-year', re: /(exp|expir\w*|venc\w*|cad\w*).*\b(year|ano|yy|yyyy|aa|aaaa)\b|\b(year|ano)\b.*(exp|venc|cad)|\bcc ?(exp )?year\b|\bexp ?(yy|yyyy)\b/ },
  { type: 'cc-exp', re: /expir|expiry|\bexp ?date\b|\bcc ?exp\b|caducidad|vencimiento|valid ?(thru|until)|\bmm ?\/? ?(yy|aa|yyyy|aaaa)\b/ },
  { type: 'email', re: /e ?mail|correo/ },
  { type: 'tel', re: /phone|telefono|\btel\b|\bmovil\b|mobile|celular|\bfono\b/ },
  { type: 'postal-code', re: /\bzip\b|zip ?code|zipcode|postal|post ?code|postcode|codigo postal|\bcp\b|\bc ?p\b/ },
  { type: 'country', re: /country|\bpais\b/ },
  { type: 'address-level1', re: /\bstate\b|province|provincia|\bregion\b|county|comunidad|\bestado\b/ },
  { type: 'address-level2', re: /\bcity\b|\btown\b|ciudad|localidad|poblacion|municipio|locality|suburb/ },
  { type: 'address-line2', re: /(address|addr|direccion|line|linea) ?2\b|address2|addr2|line2|apartment|\bapt\b|\bsuite\b|\bpiso\b|\bpuerta\b|departamento|\bescalera\b|complemento/ },
  { type: 'address-line1', re: /(address|addr|direccion|line|linea) ?1\b|address1|addr1|line1|address|\baddr\b|street|\bcalle\b|direccion|domicilio|\bvia\b/ },
  { type: 'organization', re: /company|organi[sz]ation|empresa|compania|business ?name|razon social/ },
  { type: 'name', re: /full ?name|nombre (y|e) apellidos?|nombre completo|your ?name|tu nombre/ },
  { type: 'family-name', re: /last ?name|lastname|surname|apellido|family ?name|\blname\b/ },
  { type: 'given-name', re: /first ?name|firstname|given ?name|forename|\bfname\b|\bnombre\b/ },
  { type: 'name', re: /\bname\b/ },
];

/** Tipos de input compatibles con cada tipo de campo. */
function typeCompatible(fieldType: AutofillFieldType, inputType: string, tag: string): boolean {
  if (tag === 'select') {
    return fieldType === 'country' || fieldType === 'address-level1' ||
      fieldType === 'cc-exp-month' || fieldType === 'cc-exp-year';
  }
  if (tag === 'textarea') return fieldType === 'street-address' || fieldType === 'address-line1';
  if (inputType === 'email') return fieldType === 'email';
  if (inputType === 'tel') return fieldType === 'tel' || fieldType === 'cc-number' || fieldType === 'postal-code' || fieldType === 'cc-csc' || fieldType.startsWith('cc-exp');
  return true;
}

/**
 * Tipo de un campo, o null si no es de dirección ni de tarjeta. Los campos de
 * contraseña, búsqueda, ocultos o de botones nunca se clasifican.
 */
export function classifyField(field: FieldDescriptor): AutofillFieldType | null {
  const tag = field.tagName.toLowerCase();
  if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return null;
  const inputType = tag === 'input' ? (field.type ?? 'text').toLowerCase() || 'text' : '';
  if (tag === 'input' && SKIPPED_INPUT_TYPES.has(inputType)) return null;

  const fromAc = typeFromAutocomplete(field.autocomplete);
  if (fromAc === 'other') return null;
  if (fromAc) {
    // `street-address` en un input de una línea es la línea 1.
    if (fromAc === 'street-address' && tag === 'input') return 'address-line1';
    return fromAc;
  }

  if (tag === 'input' && inputType === 'email') return 'email';

  // Por orden de fiabilidad: name/id suelen ser técnicos y estables; la
  // etiqueta y el placeholder van en el idioma de la página.
  const hints = [field.name, field.id, field.label, field.placeholder]
    .filter((h): h is string => typeof h === 'string' && h.trim().length > 0)
    .map(normalizeHint);
  if (hints.length === 0) {
    return tag === 'input' && inputType === 'tel' ? 'tel' : null;
  }

  for (const hint of hints) {
    if (EXCLUDE_RE.test(hint)) return null;
  }

  for (const hint of hints) {
    for (const rule of RULES) {
      if (rule.re.test(hint) && typeCompatible(rule.type, inputType, tag)) {
        return rule.type;
      }
    }
  }
  if (tag === 'input' && inputType === 'tel') return 'tel';
  return null;
}

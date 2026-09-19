import type { AddressData, CardData } from '../types/autofill';
import type { AutofillFieldType } from './fields';
import {
  expiryFormatFor,
  formatExpiry,
  luhnValid,
  normalizeCardNumber,
  parseExpMonth,
  parseExpYear,
  parseExpiry,
} from './card';

/**
 * Traducción entre una entrada guardada y los campos de un formulario, en los
 * dos sentidos: qué valor lleva cada campo al rellenar, y qué entrada sale de
 * los campos que el usuario ha escrito al enviar.
 */

export const EMPTY_ADDRESS: AddressData = {
  label: '',
  fullName: '',
  company: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  postalCode: '',
  region: '',
  country: '',
  phone: '',
  email: '',
};

/**
 * Nombre y apellidos a partir del nombre completo. Primera palabra como
 * nombre y el resto como apellidos: acierta con "Ana García López" y con
 * "John Smith"; los nombres compuestos quedan partidos, igual que en Chrome.
 */
export function splitFullName(full: string): { given: string; family: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { given: '', family: '' };
  return { given: parts[0]!, family: parts.slice(1).join(' ') };
}

/**
 * Valor de texto para un campo de dirección. `hasFamilyField` indica si el
 * formulario tiene campo de apellidos: si no lo tiene, un campo "Nombre"
 * recibe el nombre completo.
 */
export function addressValueFor(
  type: AutofillFieldType,
  address: AddressData,
  opts: { hasFamilyField?: boolean } = {},
): string | null {
  switch (type) {
    case 'name': return address.fullName;
    case 'given-name':
      return opts.hasFamilyField === false ? address.fullName : splitFullName(address.fullName).given;
    case 'family-name': return splitFullName(address.fullName).family;
    case 'organization': return address.company;
    case 'street-address':
      return [address.addressLine1, address.addressLine2].filter(Boolean).join('\n');
    case 'address-line1': return address.addressLine1;
    case 'address-line2': return address.addressLine2;
    case 'address-level2': return address.city;
    case 'address-level1': return address.region;
    case 'postal-code': return address.postalCode;
    case 'country': return address.country;
    case 'tel': return address.phone;
    case 'email': return address.email;
    default: return null;
  }
}

/**
 * Valor de texto para un campo de tarjeta. La caducidad se adapta al formato
 * del campo (placeholder / maxLength). El código de seguridad nunca tiene
 * valor: no se guarda.
 */
export function cardValueFor(
  type: AutofillFieldType,
  card: Pick<CardData, 'holderName' | 'number' | 'expMonth' | 'expYear'>,
  field: { placeholder?: string | null; maxLength?: number | null } = {},
): string | null {
  switch (type) {
    case 'cc-name': return card.holderName;
    case 'cc-number': return card.number;
    case 'cc-exp':
      if (card.expMonth == null || card.expYear == null) return null;
      return formatExpiry(card.expMonth, card.expYear, expiryFormatFor(field));
    case 'cc-exp-month':
      return card.expMonth == null ? null : String(card.expMonth).padStart(2, '0');
    case 'cc-exp-year': {
      if (card.expYear == null) return null;
      const twoDigits = field.maxLength === 2 || /^(yy|aa)$/i.test((field.placeholder ?? '').trim());
      return twoDigits ? String(card.expYear % 100).padStart(2, '0') : String(card.expYear);
    }
    default: return null;
  }
}

export interface CapturedField {
  type: AutofillFieldType;
  value: string;
}

const LIMIT = 200;

function clip(s: string): string {
  return s.trim().slice(0, LIMIT);
}

/**
 * Dirección a partir de los campos de un formulario enviado. Devuelve null si
 * no hay lo mínimo para que merezca la pena guardarla: una línea de dirección
 * y ciudad o código postal.
 */
export function addressFromFields(fields: readonly CapturedField[]): AddressData | null {
  const out: AddressData = { ...EMPTY_ADDRESS };
  let given = '';
  let family = '';
  for (const { type, value } of fields) {
    const v = clip(value);
    if (!v) continue;
    switch (type) {
      case 'name': out.fullName ||= v; break;
      case 'given-name': given ||= v; break;
      case 'family-name': family ||= v; break;
      case 'organization': out.company ||= v; break;
      case 'street-address': {
        const [l1, ...rest] = v.split(/\r?\n/);
        out.addressLine1 ||= (l1 ?? '').trim();
        out.addressLine2 ||= rest.join(' ').trim();
        break;
      }
      case 'address-line1': out.addressLine1 ||= v; break;
      case 'address-line2': out.addressLine2 ||= v; break;
      case 'address-level2': out.city ||= v; break;
      case 'address-level1': out.region ||= v; break;
      case 'postal-code': out.postalCode ||= v; break;
      case 'country': out.country ||= v; break;
      case 'tel': out.phone ||= v; break;
      case 'email': out.email ||= v; break;
      default: break;
    }
  }
  if (!out.fullName && (given || family)) out.fullName = [given, family].filter(Boolean).join(' ');
  if (!out.addressLine1 || (!out.city && !out.postalCode)) return null;
  return out;
}

/**
 * Tarjeta a partir de los campos de un formulario enviado. Exige un número
 * que pase Luhn. El código de seguridad se ignora aunque venga en la lista.
 */
export function cardFromFields(fields: readonly CapturedField[]): CardData | null {
  let number = '';
  let holderName = '';
  let expMonth: number | null = null;
  let expYear: number | null = null;
  for (const { type, value } of fields) {
    const v = clip(value);
    if (!v) continue;
    switch (type) {
      case 'cc-number': number ||= normalizeCardNumber(v); break;
      case 'cc-name': holderName ||= v; break;
      case 'cc-exp': {
        const parsed = parseExpiry(v);
        if (parsed) {
          expMonth ??= parsed.month;
          expYear ??= parsed.year;
        }
        break;
      }
      case 'cc-exp-month': expMonth ??= parseExpMonth(v); break;
      case 'cc-exp-year': expYear ??= parseExpYear(v); break;
      // cc-csc: nunca se captura.
      default: break;
    }
  }
  if (!luhnValid(number)) return null;
  return { number, holderName, expMonth, expYear, alias: '' };
}

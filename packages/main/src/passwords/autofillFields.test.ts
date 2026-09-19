import { describe, expect, it } from 'vitest';
import {
  EMPTY_ADDRESS,
  addressFromFields,
  addressValueFor,
  autocompleteSection,
  cardFromFields,
  cardValueFor,
  classifyField,
  countryCode,
  detectCardBrand,
  expiryFormatFor,
  fieldKind,
  formatExpiry,
  luhnValid,
  maskCardNumber,
  matchCountryOption,
  matchMonthOption,
  matchRegionOption,
  matchYearOption,
  parseExpMonth,
  parseExpYear,
  parseExpiry,
  splitFullName,
  type FieldDescriptor,
} from '@vela/shared';

const input = (d: Partial<FieldDescriptor>): FieldDescriptor => ({ tagName: 'INPUT', type: 'text', ...d });

describe('classifyField — autocomplete estándar', () => {
  it.each([
    ['name', 'name'],
    ['given-name', 'given-name'],
    ['shipping address-line1', 'address-line1'],
    ['section-envio billing postal-code', 'postal-code'],
    ['country-name', 'country'],
    ['tel-national', 'tel'],
    ['cc-name', 'cc-name'],
    ['cc-number', 'cc-number'],
    ['cc-exp', 'cc-exp'],
    ['cc-exp-month', 'cc-exp-month'],
    ['cc-exp-year', 'cc-exp-year'],
    ['cc-csc', 'cc-csc'],
  ])('%s → %s', (ac, expected) => {
    expect(classifyField(input({ autocomplete: ac }))).toBe(expected);
  });

  it('street-address en un input es la línea 1; en un textarea, la dirección completa', () => {
    expect(classifyField(input({ autocomplete: 'street-address' }))).toBe('address-line1');
    expect(classifyField({ tagName: 'TEXTAREA', autocomplete: 'street-address' })).toBe('street-address');
  });

  it('un autocomplete de credenciales gana a la heurística', () => {
    expect(classifyField(input({ autocomplete: 'username', name: 'email' }))).toBeNull();
    expect(classifyField(input({ autocomplete: 'one-time-code', name: 'postal' }))).toBeNull();
  });

  it('autocomplete="off" no impide la heurística', () => {
    expect(classifyField(input({ autocomplete: 'off', name: 'postal_code' }))).toBe('postal-code');
  });
});

describe('classifyField — heurística', () => {
  it.each<[Partial<FieldDescriptor>, string]>([
    [{ name: 'firstName' }, 'given-name'],
    [{ name: 'last_name' }, 'family-name'],
    [{ label: 'Apellidos' }, 'family-name'],
    [{ label: 'Nombre y apellidos' }, 'name'],
    [{ label: 'Nombre' }, 'given-name'],
    [{ name: 'full_name' }, 'name'],
    [{ label: 'Empresa' }, 'organization'],
    [{ name: 'billing_address_1' }, 'address-line1'],
    [{ label: 'Dirección' }, 'address-line1'],
    [{ name: 'address2' }, 'address-line2'],
    [{ label: 'Piso / puerta' }, 'address-line2'],
    [{ label: 'Ciudad' }, 'address-level2'],
    [{ label: 'Localidad' }, 'address-level2'],
    [{ label: 'Código postal' }, 'postal-code'],
    [{ name: 'zip' }, 'postal-code'],
    [{ label: 'Provincia' }, 'address-level1'],
    [{ label: 'País' }, 'country'],
    [{ label: 'Teléfono móvil' }, 'tel'],
    [{ type: 'email', name: 'x' }, 'email'],
    [{ label: 'Correo electrónico' }, 'email'],
    [{ name: 'cardNumber' }, 'cc-number'],
    [{ label: 'Número de tarjeta' }, 'cc-number'],
    [{ label: 'Titular de la tarjeta' }, 'cc-name'],
    [{ label: 'Name on card' }, 'cc-name'],
    [{ placeholder: 'MM/AA' }, 'cc-exp'],
    [{ label: 'Fecha de caducidad' }, 'cc-exp'],
    [{ name: 'exp_month' }, 'cc-exp-month'],
    [{ name: 'expiry-year' }, 'cc-exp-year'],
    [{ label: 'CVV' }, 'cc-csc'],
    [{ label: 'Código de seguridad' }, 'cc-csc'],
  ])('%o → %s', (d, expected) => {
    expect(classifyField(input(d))).toBe(expected);
  });

  it('selects de país, provincia, mes y año', () => {
    expect(classifyField({ tagName: 'SELECT', name: 'country' })).toBe('country');
    expect(classifyField({ tagName: 'SELECT', label: 'Provincia' })).toBe('address-level1');
    expect(classifyField({ tagName: 'SELECT', name: 'exp_month' })).toBe('cc-exp-month');
    expect(classifyField({ tagName: 'SELECT', name: 'exp_year' })).toBe('cc-exp-year');
  });

  it('ignora contraseñas, búsquedas, ocultos y campos de login', () => {
    expect(classifyField(input({ type: 'password', name: 'address' }))).toBeNull();
    expect(classifyField(input({ type: 'hidden', name: 'address' }))).toBeNull();
    expect(classifyField(input({ type: 'search', name: 'city' }))).toBeNull();
    expect(classifyField(input({ name: 'username' }))).toBeNull();
    expect(classifyField(input({ label: 'Buscar ciudad' }))).toBeNull();
    expect(classifyField(input({ name: 'coupon_code' }))).toBeNull();
    expect(classifyField(input({ name: 'qwerty' }))).toBeNull();
  });

  it('kind y sección', () => {
    expect(fieldKind('cc-number')).toBe('card');
    expect(fieldKind('postal-code')).toBe('address');
    expect(autocompleteSection('section-a shipping address-line1')).toBe('section-a shipping');
    expect(autocompleteSection('postal-code')).toBe('');
  });
});

describe('tarjetas: Luhn y marca', () => {
  it('Luhn', () => {
    expect(luhnValid('4111 1111 1111 1111')).toBe(true);
    expect(luhnValid('4111111111111112')).toBe(false);
    expect(luhnValid('5555-5555-5555-4444')).toBe(true);
    expect(luhnValid('378282246310005')).toBe(true);
    expect(luhnValid('1234')).toBe(false);
    expect(luhnValid('')).toBe(false);
  });

  it.each([
    ['4111111111111111', 'visa'],
    ['5555555555554444', 'mastercard'],
    ['2221000000000009', 'mastercard'],
    ['378282246310005', 'amex'],
    ['6011111111111117', 'discover'],
    ['30569309025904', 'diners'],
    ['3530111333300000', 'jcb'],
    ['6200000000000005', 'unionpay'],
    ['6759649826438453', 'maestro'],
    ['9999999999999995', 'unknown'],
  ])('%s → %s', (n, brand) => {
    expect(detectCardBrand(n)).toBe(brand);
  });

  it('enmascara con los últimos cuatro dígitos', () => {
    expect(maskCardNumber('4111 1111 1111 1234')).toBe('•••• 1234');
  });
});

describe('caducidad', () => {
  it('formatea según el campo', () => {
    expect(formatExpiry(7, 2029)).toBe('07/29');
    expect(formatExpiry(7, 2029, expiryFormatFor({ placeholder: 'MM/AAAA' }))).toBe('07/2029');
    expect(formatExpiry(7, 2029, expiryFormatFor({ placeholder: 'MM / YY' }))).toBe('07 / 29');
    expect(formatExpiry(7, 2029, expiryFormatFor({ placeholder: 'MMYY' }))).toBe('0729');
    expect(formatExpiry(7, 2029, expiryFormatFor({ maxLength: 4 }))).toBe('0729');
    expect(formatExpiry(7, 2029, expiryFormatFor({ maxLength: 7 }))).toBe('07/2029');
    expect(formatExpiry(12, 2030, expiryFormatFor({ placeholder: 'mm-yy' }))).toBe('12-30');
    // Un separador que no cabe en maxLength se estrecha.
    expect(formatExpiry(7, 2029, expiryFormatFor({ placeholder: 'MM / YY', maxLength: 5 }))).toBe('07/29');
  });

  it('interpreta lo escrito', () => {
    expect(parseExpiry('07/29')).toEqual({ month: 7, year: 2029 });
    expect(parseExpiry('7/2029')).toEqual({ month: 7, year: 2029 });
    expect(parseExpiry('07 / 29')).toEqual({ month: 7, year: 2029 });
    expect(parseExpiry('0729')).toEqual({ month: 7, year: 2029 });
    expect(parseExpiry('13/29')).toBeNull();
    expect(parseExpiry('hola')).toBeNull();
    expect(parseExpMonth('07')).toBe(7);
    expect(parseExpMonth('Julio')).toBe(7);
    expect(parseExpMonth('dec')).toBe(12);
    expect(parseExpYear('29')).toBe(2029);
    expect(parseExpYear('2031')).toBe(2031);
  });

  it('valores de campos sueltos de mes y año', () => {
    const card = { holderName: 'A', number: '4111111111111111', expMonth: 3, expYear: 2031 };
    expect(cardValueFor('cc-exp-month', card)).toBe('03');
    expect(cardValueFor('cc-exp-year', card)).toBe('2031');
    expect(cardValueFor('cc-exp-year', card, { maxLength: 2 })).toBe('31');
    expect(cardValueFor('cc-csc', card)).toBeNull();
  });
});

describe('selects', () => {
  const countries = [
    { value: '', text: 'Selecciona…' },
    { value: 'FR', text: 'Francia' },
    { value: 'ES', text: 'España' },
    { value: 'US', text: 'Estados Unidos' },
  ];

  it('país por código, nombre en español o en inglés', () => {
    expect(countryCode('España')).toBe('ES');
    expect(countryCode('spain')).toBe('ES');
    expect(countryCode('es')).toBe('ES');
    expect(matchCountryOption(countries, 'España')).toBe(2);
    expect(matchCountryOption(countries, 'Spain')).toBe(2);
    expect(matchCountryOption(countries, 'ES')).toBe(2);
    expect(matchCountryOption([{ value: 'spain', text: 'Spain' }], 'España')).toBe(0);
    expect(matchCountryOption(countries, 'Narnia')).toBe(-1);
  });

  it('provincia exacta o por prefijo único', () => {
    const regions = [{ value: '28', text: 'Madrid' }, { value: '08', text: 'Barcelona' }, { value: '03', text: 'Alicante/Alacant' }];
    expect(matchRegionOption(regions, 'madrid')).toBe(0);
    expect(matchRegionOption(regions, 'Alicante')).toBe(2);
    expect(matchRegionOption(regions, 'Sevilla')).toBe(-1);
  });

  it('mes y año', () => {
    const months = [{ value: '', text: 'Mes' }, ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), text: String(i + 1).padStart(2, '0') }))];
    expect(matchMonthOption(months, 7)).toBe(7);
    expect(matchMonthOption([{ value: 'ene', text: 'Enero' }, { value: 'feb', text: 'Febrero' }], 2)).toBe(1);
    expect(matchMonthOption([{ value: 'x', text: '03 - Marzo' }], 3)).toBe(0);
    expect(matchYearOption([{ value: '2028', text: '2028' }, { value: '2029', text: '2029' }], 2029)).toBe(1);
    expect(matchYearOption([{ value: '28', text: '28' }, { value: '29', text: '29' }], 2029)).toBe(1);
  });
});

describe('valores de dirección', () => {
  const address = { ...EMPTY_ADDRESS, fullName: 'Ana García López', addressLine1: 'Calle Mayor 1', addressLine2: '3º B' };

  it('parte el nombre completo', () => {
    expect(splitFullName('Ana García López')).toEqual({ given: 'Ana', family: 'García López' });
    expect(addressValueFor('given-name', address, { hasFamilyField: true })).toBe('Ana');
    expect(addressValueFor('family-name', address)).toBe('García López');
    // Sin campo de apellidos, "Nombre" recibe el nombre completo.
    expect(addressValueFor('given-name', address, { hasFamilyField: false })).toBe('Ana García López');
    expect(addressValueFor('street-address', address)).toBe('Calle Mayor 1\n3º B');
  });
});

describe('captura de formularios enviados', () => {
  it('construye una dirección', () => {
    const a = addressFromFields([
      { type: 'given-name', value: 'Ana' },
      { type: 'family-name', value: 'García' },
      { type: 'address-line1', value: 'Calle Mayor 1' },
      { type: 'postal-code', value: '28013' },
      { type: 'country', value: 'España' },
    ]);
    expect(a).toMatchObject({ fullName: 'Ana García', addressLine1: 'Calle Mayor 1', postalCode: '28013', country: 'España' });
  });

  it('sin calle o sin ciudad/código postal no hay dirección', () => {
    expect(addressFromFields([{ type: 'email', value: 'a@b.c' }, { type: 'name', value: 'Ana' }])).toBeNull();
    expect(addressFromFields([{ type: 'address-line1', value: 'Calle Mayor 1' }])).toBeNull();
  });

  it('construye una tarjeta sin CVV y exige Luhn', () => {
    const fields = [
      { type: 'cc-number' as const, value: '4111 1111 1111 1111' },
      { type: 'cc-name' as const, value: 'ANA GARCIA' },
      { type: 'cc-exp' as const, value: '07/29' },
      { type: 'cc-csc' as const, value: '123' },
    ];
    const card = cardFromFields(fields);
    expect(card).toEqual({ number: '4111111111111111', holderName: 'ANA GARCIA', expMonth: 7, expYear: 2029, alias: '' });
    expect(JSON.stringify(card)).not.toContain('123"');
    expect(cardFromFields([{ type: 'cc-number', value: '4111111111111112' }])).toBeNull();
  });

  it('caducidad en campos separados', () => {
    const card = cardFromFields([
      { type: 'cc-number', value: '5555555555554444' },
      { type: 'cc-exp-month', value: '3' },
      { type: 'cc-exp-year', value: '31' },
    ]);
    expect(card).toMatchObject({ expMonth: 3, expYear: 2031 });
  });
});

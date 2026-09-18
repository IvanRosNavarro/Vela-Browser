import { z } from 'zod';

// Cotas generosas pero finitas: todo lo que entra por IPC viene de una página
// web (captura) o de la interfaz, y acaba cifrado en profile.db.
const text = (max = 200) => z.string().max(max).transform((s) => s.trim());

export const addressDataSchema = z.object({
  label: text(80).default(''),
  fullName: text().default(''),
  company: text().default(''),
  addressLine1: text().default(''),
  addressLine2: text().default(''),
  city: text().default(''),
  postalCode: text(40).default(''),
  region: text().default(''),
  country: text(80).default(''),
  phone: text(40).default(''),
  email: text(254).default(''),
});

export const cardDataSchema = z.object({
  holderName: text().default(''),
  // Solo dígitos (se normaliza antes); 12–19 es el rango ISO/IEC 7812.
  number: z.string().max(40).transform((s) => s.replace(/\D/g, '')).pipe(z.string().min(12).max(19)),
  expMonth: z.number().int().min(1).max(12).nullable().default(null),
  expYear: z.number().int().min(2000).max(2100).nullable().default(null),
  alias: text(80).default(''),
});

const idSchema = z.string().min(1).max(64);

export const autofillSaveAddressSchema = z.object({
  id: idSchema.optional(),
  data: addressDataSchema,
});

export const autofillSaveCardSchema = z.object({
  id: idSchema.optional(),
  data: cardDataSchema,
});

export const autofillIdSchema = z.object({ id: idSchema });

export const autofillTokenSchema = z.object({ token: z.string().min(1).max(64) });

export const autofillPopupFillSchema = z.object({
  token: z.string().min(1).max(64),
  id: idSchema,
});

export const autofillSaveDecisionSchema = z.object({
  token: z.string().min(1).max(64),
  save: z.boolean(),
});

export const autofillOpenManagerSchema = z.object({
  view: z.enum(['addresses', 'cards']),
  /** Desde el popup de relleno: identifica la ventana en la que abrir la pestaña. */
  token: z.string().min(1).max(64).optional(),
});

export const autofillFieldDismissedSchema = z.object({
  reason: z.enum(['blur', 'escape', 'input', 'hidden']),
});

// ─── Mensajes desde el preload de las pestañas web (no confiables) ───────────

const rectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(0),
  height: z.number().finite().min(0),
});

export const autofillFieldFocusedSchema = z.object({
  kind: z.enum(['address', 'card']),
  rect: rectSchema,
});

export const autofillPopupKeySchema = z.object({
  key: z.enum(['ArrowDown', 'ArrowUp', 'Enter']),
});

const capturedFieldSchema = z.object({
  type: z.enum([
    'name', 'given-name', 'family-name', 'organization', 'street-address',
    'address-line1', 'address-line2', 'address-level2', 'address-level1',
    'postal-code', 'country', 'tel', 'email',
    'cc-name', 'cc-number', 'cc-exp', 'cc-exp-month', 'cc-exp-year',
  ]),
  value: z.string().max(400),
});

export const autofillFormSubmittedSchema = z.object({
  fields: z.array(capturedFieldSchema).max(60),
});

export type AutofillFieldFocusedInput = z.infer<typeof autofillFieldFocusedSchema>;
export type AutofillFormSubmittedInput = z.infer<typeof autofillFormSubmittedSchema>;

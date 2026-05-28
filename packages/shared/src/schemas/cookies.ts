import { z } from 'zod';

export const cookieGetForUrlSchema = z.object({
  url: z.string().url(),
});

export const cookieSetSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(4096),
  value: z.string().max(4096),
  domain: z.string().max(256).optional(),
  path: z.string().max(256).optional(),
  expirationDate: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: z.enum(['unspecified', 'no_restriction', 'lax', 'strict']).optional(),
});

export const cookieRemoveSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1),
});

export const cookieRemoveAllForDomainSchema = z.object({
  domain: z.string().max(256),
});

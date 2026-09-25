import { z } from 'zod';

export const integrationProviderSchema = z.enum(['github']);

export const integrationStartDeviceFlowSchema = z.object({
  provider: integrationProviderSchema,
});

export const integrationConnectTokenSchema = z.object({
  provider: integrationProviderSchema,
  /** PAT pegado por el usuario. Se cifra antes de tocar disco. */
  token: z.string().min(8).max(500),
});

export const integrationProviderOnlySchema = z.object({
  provider: integrationProviderSchema,
});

export const integrationSetEnabledSchema = z.object({
  provider: integrationProviderSchema,
  enabled: z.boolean(),
});

export const integrationOpenPrSchema = z.object({
  /** URL de la PR tal cual la entregó el proveedor. */
  url: z.string().url(),
  /** false abre en segundo plano (por defecto). */
  activate: z.boolean().optional(),
});

export const integrationSetClientIdSchema = z.object({
  provider: integrationProviderSchema,
  /** Vacío restaura el client id que trae Vela. */
  clientId: z.string().max(200),
});

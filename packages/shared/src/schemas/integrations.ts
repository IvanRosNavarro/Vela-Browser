import { z } from 'zod';

export const integrationProviderSchema = z.enum(['github', 'bitbucket', 'jira']);

export const integrationStartDeviceFlowSchema = z.object({
  provider: integrationProviderSchema,
});

export const integrationConnectTokenSchema = z.object({
  provider: integrationProviderSchema,
  /** Token pegado por el usuario. Se cifra antes de tocar disco. */
  token: z.string().min(8).max(500),
  /** Email de la cuenta de Atlassian: los API tokens van con él en Basic auth. */
  email: z.string().email().max(320).optional(),
  /**
   * Sitio de Jira tal como lo escriba el usuario (`acme`, `acme.atlassian.net` o
   * una URL). Main lo normaliza y rechaza cualquier host que no sea de Atlassian.
   */
  site: z.string().min(1).max(253).optional(),
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

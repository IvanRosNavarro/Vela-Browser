import { z } from 'zod';

export const customThemeExportSchema = z.object({
  format: z.literal('vela-theme'),
  version: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1).max(64),
  type: z.enum(['light', 'dark']),
  variables: z.record(z.string(), z.string()),
});

export type CustomThemeExport = z.infer<typeof customThemeExportSchema>;

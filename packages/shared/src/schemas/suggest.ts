import { z } from 'zod';

export const suggestQueryInputSchema = z.object({
  query: z.string().max(2048),
  limit: z.number().int().positive().max(20).optional(),
});

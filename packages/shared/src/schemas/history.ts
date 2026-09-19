import { z } from 'zod';

export const historyAutocompleteInputSchema = z.object({
  prefix: z.string().min(1).max(2048),
});

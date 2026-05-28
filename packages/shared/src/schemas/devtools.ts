import { z } from 'zod';

export const devtoolsSetEmulationInputSchema = z.object({
  width:           z.number().int().min(100).max(10000),
  height:          z.number().int().min(100).max(10000),
  dpr:             z.number().min(0.1).max(10),
  mobile:          z.boolean(),
  backgroundColor: z.string().default('#1e1e1e'),
});

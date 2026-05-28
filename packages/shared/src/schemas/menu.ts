import { z } from 'zod';
import type { MenuItemSpec } from '../types/menu';

const baseSeparator = z.object({
  type: z.literal('separator'),
});

const baseNormal = z.object({
  type: z.literal('normal'),
  id: z.string().min(1),
  label: z.string().min(1).max(200),
  enabled: z.boolean().optional(),
});

export const menuItemSpecSchema: z.ZodType<MenuItemSpec> = z.lazy(() =>
  z.discriminatedUnion('type', [
    baseSeparator,
    baseNormal,
    z.object({
      type: z.literal('submenu'),
      label: z.string().min(1).max(200),
      enabled: z.boolean().optional(),
      submenu: z.array(menuItemSpecSchema).min(1).max(50),
    }),
  ]) as z.ZodType<MenuItemSpec>,
);

export const menuShowInputSchema = z.object({
  items: z.array(menuItemSpecSchema).min(1).max(50),
});

import { z } from 'zod';

export const shortcutsSetInputSchema = z.object({
  commandId: z.string().min(1),
  shortcut: z.string().nullable(),
});

export const shortcutsImportSchema = z.record(z.string(), z.string().nullable());

export type ShortcutsSetInput = z.input<typeof shortcutsSetInputSchema>;

export const shortcutsResetOneInputSchema = z.object({
  commandId: z.string().min(1),
});

export type ShortcutsResetOneInput = z.input<typeof shortcutsResetOneInputSchema>;

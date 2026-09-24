import { z } from 'zod';

/**
 * Lo que el renderer manda al soltar algo desde fuera de Vela. El valor de un
 * `file` es una ruta del sistema, que solo puede haber salido de un `drop`
 * real: el renderer la obtiene con `webUtils.getPathForFile` en el preload.
 */
export const droppedItemSchema = z.object({
  kind: z.enum(['url', 'file', 'text']),
  value: z.string().min(1).max(4096),
});

export const dndOpenDroppedInputSchema = z.object({
  /** Tope defensivo: el renderer ya pide confirmación a partir de 15. */
  items: z.array(droppedItemSchema).min(1).max(100),
  /** Carpeta donde cae, si se soltó sobre una. */
  parentId: z.string().min(1).nullable().optional(),
});

export type DroppedItemInput = z.infer<typeof droppedItemSchema>;
export type DndOpenDroppedInput = z.infer<typeof dndOpenDroppedInputSchema>;

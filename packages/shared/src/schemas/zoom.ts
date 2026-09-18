import { z } from 'zod';

/** Pestaña sobre la que actúa el zoom de página. */
export const zoomTabInputSchema = z.object({
  tabId: z.string().min(1).max(128),
});

export const zoomStepInputSchema = z.object({
  tabId: z.string().min(1).max(128),
  direction: z.enum(['in', 'out']),
});

export const zoomOpenPopupInputSchema = z.object({
  windowId: z.number().int().nonnegative(),
  tabId: z.string().min(1).max(128),
  anchorRect: z.object({
    right: z.number().finite(),
    bottom: z.number().finite(),
  }),
});

export const zoomClosePopupInputSchema = z.object({
  windowId: z.number().int().nonnegative(),
});

export type ZoomTabInput = z.infer<typeof zoomTabInputSchema>;
export type ZoomStepInput = z.infer<typeof zoomStepInputSchema>;
export type ZoomOpenPopupInput = z.infer<typeof zoomOpenPopupInputSchema>;
export type ZoomClosePopupInput = z.infer<typeof zoomClosePopupInputSchema>;

import { z } from 'zod';

export const trackpadNavigateSchema = z.object({
  direction: z.enum(['back', 'forward']),
});

export type TrackpadNavigateInput = z.infer<typeof trackpadNavigateSchema>;

/** Lo que necesita el preload de una pestaña para decidir un swipe. */
export interface TrackpadState {
  enabled: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

import { z } from 'zod';

/**
 * Consulta síncrona del preload de una pestaña al arrancar cada documento:
 * ¿lleva modo oscuro? La URL solo decide el aspecto de esa misma pestaña.
 */
export const darkModeStateQuerySchema = z.object({
  url: z.string().max(8192),
});

/**
 * Hoja de estilo o imagen de otro origen que Dark Reader necesita leer y que
 * CORS le impide pedir desde la página.
 */
export const darkModeFetchSchema = z.object({
  url: z.string().min(1).max(8192),
});

/** El preload informa de si el documento ya era oscuro sin Dark Reader. */
export const darkModeNativeDarkSchema = z.object({
  dark: z.boolean(),
});

export type DarkModeStateQuery = z.infer<typeof darkModeStateQuerySchema>;
export type DarkModeFetchInput = z.infer<typeof darkModeFetchSchema>;

/** Respuesta de `darkmode:fetch`. */
export interface DarkModeFetchResult {
  body: Uint8Array;
  contentType: string;
}

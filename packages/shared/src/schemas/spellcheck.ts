import { z } from 'zod';

/** `spellcheck:get-info` no lleva argumentos: el perfil sale del frame. */
export const spellcheckGetInfoInputSchema = z.object({}).strict().optional();

/**
 * Valor persistido en `spellcheck:languages`: lista de códigos BCP 47 que el
 * usuario ha elegido. `null` (o ausente) significa «los idiomas preferidos del
 * sistema».
 */
export const spellcheckLanguagesValueSchema = z
  .array(z.string().min(2).max(35))
  .max(50)
  .nullable();

/** Estado del corrector ortográfico del perfil, para `vela://settings`. */
export interface SpellcheckInfo {
  enabled: boolean;
  /** Idiomas con diccionario disponible en esta máquina. */
  available: string[];
  /** Idiomas que la sesión del perfil está usando ahora mismo. */
  active: string[];
  /** true si el usuario no ha elegido idiomas y se siguen los del sistema. */
  followsSystem: boolean;
  /**
   * true en macOS: el corrector es el del sistema, detecta el idioma solo y
   * Electron ignora la lista de idiomas.
   */
  systemManaged: boolean;
  /**
   * true en Linux: Electron usa Hunspell y descarga los diccionarios de un
   * CDN de Google la primera vez que se activa cada idioma.
   */
  downloadsDictionaries: boolean;
}

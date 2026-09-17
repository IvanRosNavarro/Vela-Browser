import {
  findInvalidCssUrls as findInvalidCssUrlsKit,
  validateCustomCss as validateCustomCssKit,
} from 'vela-kit/theme';

/**
 * Esquemas admitidos en `url()` del CSS custom además de `data:` (ADR 0013):
 * `vela:` para recursos internos. El validador vive en vela-kit (ADR 0106).
 */
export const CUSTOM_CSS_URL_SCHEMES: readonly string[] = ['vela:'];

/** Devuelve las URLs externas no permitidas encontradas en el CSS. */
export function findInvalidCssUrls(css: string): string[] {
  return findInvalidCssUrlsKit(css, { allowedUrlSchemes: CUSTOM_CSS_URL_SCHEMES });
}

export function validateCustomCss(css: string): { valid: boolean; invalidUrls: string[] } {
  return validateCustomCssKit(css, { allowedUrlSchemes: CUSTOM_CSS_URL_SCHEMES });
}

export type FavoriteType = 'bookmark' | 'folder';

export interface Favorite {
  id: string;
  url: string | null;
  title: string;
  favicon: string | null;
  position: string;
  createdAt: number;
  type: FavoriteType;
  parentId: string | null;
}

/**
 * Esquemas que puede tener la dirección de un favorito. Fuera quedan
 * `javascript:` (bookmarklets), `data:` y los esquemas internos de otros
 * navegadores (`chrome:`, `about:`, `edge:`…), que en Vela no llevan a nada.
 */
export const FAVORITE_URL_PROTOCOLS: readonly string[] = [
  'http:',
  'https:',
  'ftp:',
  'file:',
  'mailto:',
  'vela:',
];

export function isAllowedFavoriteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return FAVORITE_URL_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Normaliza lo que el usuario escribe al editar la dirección de un favorito.
 * Sin esquema y con pinta de dominio (`ejemplo.com/ruta`) se asume https.
 * Devuelve null si el resultado no es una dirección admitida.
 */
export function normalizeFavoriteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (isAllowedFavoriteUrl(trimmed)) return new URL(trimmed).href;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  if (!hasScheme && /^[^\s/]+\.[^\s/]+/.test(trimmed)) {
    const candidate = `https://${trimmed}`;
    if (isAllowedFavoriteUrl(candidate)) return new URL(candidate).href;
  }
  return null;
}

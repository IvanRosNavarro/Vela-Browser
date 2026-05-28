export type UrlBarIconId =
  | 'cookie'
  | 'adblocker'
  | 'favorites'
  | 'developer'
  | 'copy-url'
  | 'vault'
  | 'page-indicators';

export interface UrlBarIconConfig {
  id: UrlBarIconId;
  visible: boolean;
  position: string;
}

export const DEFAULT_URLBAR_CONFIG: UrlBarIconConfig[] = [
  { id: 'cookie',          visible: true,  position: 'a' },
  { id: 'adblocker',       visible: true,  position: 'b' },
  { id: 'favorites',       visible: true,  position: 'c' },
  { id: 'developer',       visible: true,  position: 'd' },
  { id: 'copy-url',        visible: true,  position: 'e' },
  { id: 'vault',           visible: true,  position: 'f' },
  { id: 'page-indicators', visible: true,  position: 'g' },
];

export const URLBAR_ICON_LABELS: Record<UrlBarIconId, string> = {
  'cookie':          'Editor de cookies',
  'adblocker':       'Bloqueador de anuncios',
  'favorites':       'Favoritos',
  'developer':       'Modo desarrollador',
  'copy-url':        'Copiar URL',
  'vault':           'Gestor de contraseñas',
  'page-indicators': 'Indicadores de página',
};

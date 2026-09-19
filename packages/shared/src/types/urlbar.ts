export type UrlBarIconId =
  | 'cookie'
  | 'adblocker'
  | 'favorites'
  | 'developer'
  | 'copy-url'
  | 'vault'
  | 'page-indicators'
  | 'zoom';

/** Todos los ids de icono, en el orden por defecto. Fuente del z.enum de IPC. */
export const URLBAR_ICON_IDS = [
  'cookie',
  'adblocker',
  'favorites',
  'developer',
  'copy-url',
  'vault',
  'page-indicators',
  'zoom',
] as const satisfies readonly UrlBarIconId[];

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
  { id: 'zoom',            visible: true,  position: 'h' },
];

export const URLBAR_ICON_LABELS: Record<UrlBarIconId, string> = {
  'cookie':          'Editor de cookies',
  'adblocker':       'Bloqueador de anuncios',
  'favorites':       'Favoritos',
  'developer':       'Modo desarrollador',
  'copy-url':        'Copiar URL',
  'vault':           'Gestor de contraseñas',
  'page-indicators': 'Indicadores de página',
  'zoom':            'Indicador de zoom',
};

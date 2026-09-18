/** Navegadores de los que Vela sabe importar datos. */
export const IMPORT_BROWSER_IDS = [
  'chrome',
  'edge',
  'brave',
  'vivaldi',
  'opera',
  'opera-gx',
  'chromium',
  'firefox',
] as const;

export type ImportBrowserId = (typeof IMPORT_BROWSER_IDS)[number];

export type ImportBrowserEngine = 'chromium' | 'firefox';

export interface ImportableProfile {
  /**
   * Identificador del perfil dentro del navegador: el nombre del directorio
   * en Chromium (`Default`, `Profile 1`) o la ruta de `profiles.ini` en
   * Firefox. El main lo vuelve a buscar en su propia detección: nunca se
   * usa como ruta tal cual llega del renderer.
   */
  id: string;
  name: string;
  isDefault: boolean;
  hasBookmarks: boolean;
  hasHistory: boolean;
}

export interface ImportableBrowser {
  id: ImportBrowserId;
  name: string;
  engine: ImportBrowserEngine;
  profiles: ImportableProfile[];
}

export interface BrowserImportResult {
  bookmarksAdded: number;
  /** Marcadores que no se importaron por estar ya en Favoritos. */
  bookmarksSkipped: number;
  historyAdded: number;
  /** Visitas ya presentes o fuera del periodo de retención. */
  historySkipped: number;
  /** El historial no se importó porque "No registrar historial" está activo. */
  historyDisabled: boolean;
}

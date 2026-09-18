import path from 'node:path';
import type { ImportBrowserEngine, ImportBrowserId } from '@vela/shared';

/** Directorio de datos candidato de un navegador en esta plataforma. */
export interface BrowserLocation {
  id: ImportBrowserId;
  name: string;
  engine: ImportBrowserEngine;
  /**
   * Chromium: el "User Data" (contiene `Local State` y un directorio por
   * perfil). Firefox: el directorio que contiene `profiles.ini`.
   */
  dataDirs: string[];
}

export interface PlatformEnv {
  platform: NodeJS.Platform;
  home: string;
  /** %LOCALAPPDATA% en Windows. */
  localAppData?: string;
  /** %APPDATA% en Windows. */
  appData?: string;
}

interface BrowserSpec {
  id: ImportBrowserId;
  name: string;
  engine: ImportBrowserEngine;
  win?: { base: 'local' | 'roaming'; rel: string[] }[];
  mac?: string[];
  linux?: string[];
}

// Rutas por defecto de cada navegador. En Linux se añaden también las de
// Flatpak y Snap de Firefox, que es donde vive en Ubuntu y Fedora.
const SPECS: BrowserSpec[] = [
  {
    id: 'chrome',
    name: 'Chrome',
    engine: 'chromium',
    win: [{ base: 'local', rel: ['Google', 'Chrome', 'User Data'] }],
    mac: ['Library/Application Support/Google/Chrome'],
    linux: ['.config/google-chrome'],
  },
  {
    id: 'edge',
    name: 'Edge',
    engine: 'chromium',
    win: [{ base: 'local', rel: ['Microsoft', 'Edge', 'User Data'] }],
    mac: ['Library/Application Support/Microsoft Edge'],
    linux: ['.config/microsoft-edge'],
  },
  {
    id: 'brave',
    name: 'Brave',
    engine: 'chromium',
    win: [{ base: 'local', rel: ['BraveSoftware', 'Brave-Browser', 'User Data'] }],
    mac: ['Library/Application Support/BraveSoftware/Brave-Browser'],
    linux: ['.config/BraveSoftware/Brave-Browser'],
  },
  {
    id: 'vivaldi',
    name: 'Vivaldi',
    engine: 'chromium',
    win: [{ base: 'local', rel: ['Vivaldi', 'User Data'] }],
    mac: ['Library/Application Support/Vivaldi'],
    linux: ['.config/vivaldi'],
  },
  {
    id: 'opera',
    name: 'Opera',
    engine: 'chromium',
    win: [{ base: 'roaming', rel: ['Opera Software', 'Opera Stable'] }],
    mac: ['Library/Application Support/com.operasoftware.Opera'],
    linux: ['.config/opera'],
  },
  {
    id: 'opera-gx',
    name: 'Opera GX',
    engine: 'chromium',
    win: [{ base: 'roaming', rel: ['Opera Software', 'Opera GX Stable'] }],
    mac: ['Library/Application Support/com.operasoftware.OperaGX'],
  },
  {
    id: 'chromium',
    name: 'Chromium',
    engine: 'chromium',
    win: [{ base: 'local', rel: ['Chromium', 'User Data'] }],
    mac: ['Library/Application Support/Chromium'],
    linux: ['.config/chromium'],
  },
  {
    id: 'firefox',
    name: 'Firefox',
    engine: 'firefox',
    win: [{ base: 'roaming', rel: ['Mozilla', 'Firefox'] }],
    mac: ['Library/Application Support/Firefox'],
    linux: [
      '.mozilla/firefox',
      '.var/app/org.mozilla.firefox/.mozilla/firefox',
      'snap/firefox/common/.mozilla/firefox',
    ],
  },
];

/**
 * Directorios candidatos de cada navegador soportado en la plataforma dada.
 * Pura: no toca el disco; `detect.ts` comprueba cuáles existen.
 */
export function browserLocations(env: PlatformEnv): BrowserLocation[] {
  const out: BrowserLocation[] = [];
  for (const spec of SPECS) {
    let dirs: string[] = [];
    if (env.platform === 'win32') {
      const win = path.win32;
      dirs = (spec.win ?? []).flatMap(({ base, rel }) => {
        const root =
          base === 'local'
            ? env.localAppData ?? win.join(env.home, 'AppData', 'Local')
            : env.appData ?? win.join(env.home, 'AppData', 'Roaming');
        return [win.join(root, ...rel)];
      });
    } else if (env.platform === 'darwin') {
      dirs = (spec.mac ?? []).map((rel) => path.posix.join(env.home, rel));
    } else {
      dirs = (spec.linux ?? []).map((rel) => path.posix.join(env.home, rel));
    }
    if (dirs.length > 0) {
      out.push({ id: spec.id, name: spec.name, engine: spec.engine, dataDirs: dirs });
    }
  }
  return out;
}

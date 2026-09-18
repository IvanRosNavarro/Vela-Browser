import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ImportBrowserEngine, ImportBrowserId, ImportableBrowser } from '@vela/shared';
import { browserLocations, type PlatformEnv } from './paths';
import { parseChromiumLocalState } from './chromium';
import { parseProfilesIni } from './firefox';

/** Perfil detectado, con su directorio real. El directorio nunca sale del main. */
export interface DetectedProfile {
  id: string;
  name: string;
  isDefault: boolean;
  dir: string;
  bookmarksFile: string | null;
  historyFile: string | null;
}

export interface DetectedBrowser {
  id: ImportBrowserId;
  name: string;
  engine: ImportBrowserEngine;
  profiles: DetectedProfile[];
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readJson(p: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function chromiumProfiles(dataDir: string): DetectedProfile[] {
  const { names, lastUsed } = parseChromiumLocalState(readJson(path.join(dataDir, 'Local State')));

  // Directorios candidatos: los de Local State y los que siguen el patrón de
  // Chromium (por si Local State falta o está desfasado). Opera guarda el
  // perfil en la raíz del directorio de datos, sin subdirectorio.
  const dirs = new Set<string>(Object.keys(names));
  try {
    for (const entry of fs.readdirSync(dataDir)) {
      if (/^(Default|Profile \d+)$/.test(entry)) dirs.add(entry);
    }
  } catch { /* directorio ilegible: nos quedamos con Local State */ }
  dirs.add('.');

  const profiles: DetectedProfile[] = [];
  for (const rel of dirs) {
    const dir = rel === '.' ? dataDir : path.join(dataDir, rel);
    if (!isDir(dir)) continue;
    const bookmarks = path.join(dir, 'Bookmarks');
    const history = path.join(dir, 'History');
    const bookmarksFile = isFile(bookmarks) ? bookmarks : null;
    const historyFile = isFile(history) ? history : null;
    if (!bookmarksFile && !historyFile) continue;
    profiles.push({
      id: dir,
      name: rel === '.' ? 'Predeterminado' : names[rel] ?? rel,
      isDefault: rel === '.' || rel === (lastUsed ?? 'Default'),
      dir,
      bookmarksFile,
      historyFile,
    });
  }
  return profiles.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

function firefoxProfiles(dataDir: string): DetectedProfile[] {
  let ini: string;
  try {
    ini = fs.readFileSync(path.join(dataDir, 'profiles.ini'), 'utf8');
  } catch {
    return [];
  }
  const profiles: DetectedProfile[] = [];
  for (const entry of parseProfilesIni(ini)) {
    const dir = entry.isRelative ? path.join(dataDir, entry.path) : entry.path;
    const places = path.join(dir, 'places.sqlite');
    if (!isFile(places)) continue;
    // places.sqlite contiene marcadores e historial a la vez.
    profiles.push({
      id: dir,
      name: entry.name,
      isDefault: entry.isDefault,
      dir,
      bookmarksFile: places,
      historyFile: places,
    });
  }
  return profiles.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

export function currentPlatformEnv(): PlatformEnv {
  return {
    platform: process.platform,
    home: os.homedir(),
    localAppData: process.env['LOCALAPPDATA'],
    appData: process.env['APPDATA'],
  };
}

/** Navegadores instalados con al menos un perfil del que haya algo que importar. */
export function detectBrowsers(env: PlatformEnv = currentPlatformEnv()): DetectedBrowser[] {
  const out: DetectedBrowser[] = [];
  for (const loc of browserLocations(env)) {
    const profiles: DetectedProfile[] = [];
    for (const dataDir of loc.dataDirs) {
      if (!isDir(dataDir)) continue;
      profiles.push(...(loc.engine === 'chromium' ? chromiumProfiles(dataDir) : firefoxProfiles(dataDir)));
    }
    if (profiles.length > 0) {
      out.push({ id: loc.id, name: loc.name, engine: loc.engine, profiles });
    }
  }
  return out;
}

/** Vista para el renderer: sin rutas de ficheros, solo lo necesario para elegir. */
export function toImportableBrowsers(browsers: DetectedBrowser[]): ImportableBrowser[] {
  return browsers.map((b) => ({
    id: b.id,
    name: b.name,
    engine: b.engine,
    profiles: b.profiles.map((p) => ({
      id: p.id,
      name: p.name,
      isDefault: p.isDefault,
      hasBookmarks: p.bookmarksFile !== null,
      hasHistory: p.historyFile !== null,
    })),
  }));
}

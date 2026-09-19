import type { DatabaseSync } from 'node:sqlite';
import { isAllowedFavoriteUrl } from '@vela/shared';
import {
  MAX_DEPTH,
  ROOT_FOLDER_TITLES,
  isImportableHistoryUrl,
  type HistoryReadOptions,
  type ImportedFolder,
  type ImportedNode,
  type ImportedVisit,
} from './types';

/**
 * Milisegundos entre el epoch de Chromium/Windows (1601-01-01) y el de Unix.
 * Chromium guarda las fechas en microsegundos desde 1601.
 */
export const CHROMIUM_EPOCH_OFFSET_MS = 11_644_473_600_000;

export function chromiumTimeToUnixMs(microsSince1601: number | bigint): number {
  const micros = typeof microsSince1601 === 'bigint' ? microsSince1601 : BigInt(Math.trunc(microsSince1601));
  return Number(micros / 1000n) - CHROMIUM_EPOCH_OFFSET_MS;
}

interface RawChromiumNode {
  type?: unknown;
  name?: unknown;
  url?: unknown;
  children?: unknown;
}

function convertNode(raw: RawChromiumNode, depth: number): ImportedNode | null {
  if (depth > MAX_DEPTH) return null;
  const name = typeof raw.name === 'string' ? raw.name : '';
  if (raw.type === 'url') {
    if (typeof raw.url !== 'string' || !isAllowedFavoriteUrl(raw.url)) return null;
    return { kind: 'bookmark', title: name, url: raw.url };
  }
  if (raw.type === 'folder') {
    return { kind: 'folder', title: name || 'Carpeta', children: convertChildren(raw.children, depth + 1) };
  }
  return null;
}

function convertChildren(children: unknown, depth: number): ImportedNode[] {
  if (!Array.isArray(children)) return [];
  const out: ImportedNode[] = [];
  for (const child of children) {
    if (typeof child !== 'object' || child === null) continue;
    const node = convertNode(child as RawChromiumNode, depth);
    if (node) out.push(node);
  }
  return out;
}

/**
 * Convierte el fichero `Bookmarks` (JSON) de un perfil Chromium en carpetas
 * raíz con nombre en castellano: barra de marcadores, otros y móvil. Omite las
 * raíces vacías y las direcciones que Vela no puede abrir (bookmarklets
 * `javascript:`, páginas `chrome://`…).
 */
export function parseChromiumBookmarks(json: unknown): ImportedFolder[] {
  if (typeof json !== 'object' || json === null) return [];
  const roots = (json as { roots?: unknown }).roots;
  if (typeof roots !== 'object' || roots === null) return [];
  const r = roots as Record<string, RawChromiumNode | undefined>;

  const out: ImportedFolder[] = [];
  const pushRoot = (key: string, title: string): void => {
    const root = r[key];
    if (!root) return;
    const children = convertChildren(root.children, 1);
    if (children.length > 0) out.push({ kind: 'folder', title, children });
  };
  pushRoot('bookmark_bar', ROOT_FOLDER_TITLES.toolbar);
  pushRoot('other', ROOT_FOLDER_TITLES.other);
  pushRoot('synced', ROOT_FOLDER_TITLES.mobile);
  return out;
}

/**
 * Visitas del fichero `History` de Chromium, de la más reciente hacia atrás.
 * Descarta las cargas de subframes (transiciones AUTO/MANUAL_SUBFRAME) y las
 * URLs ocultas, que Chrome tampoco enseña en su historial. La conversión de
 * fecha se hace en SQL: los microsegundos desde 1601 no caben en un entero
 * seguro de JavaScript y `node:sqlite` lanzaría al leerlos.
 */
export function readChromiumHistory(db: DatabaseSync, opts: HistoryReadOptions): ImportedVisit[] {
  const rows = db
    .prepare(
      `SELECT u.url AS url,
              COALESCE(u.title, '') AS title,
              (v.visit_time / 1000) - ${CHROMIUM_EPOCH_OFFSET_MS} AS visited_at
         FROM visits v
         JOIN urls u ON u.id = v.url
        WHERE COALESCE(u.hidden, 0) = 0
          AND (v.transition & 255) NOT IN (3, 4)
          AND (v.visit_time / 1000) - ${CHROMIUM_EPOCH_OFFSET_MS} >= ?
        ORDER BY v.visit_time DESC
        LIMIT ?`,
    )
    .all(opts.since, opts.limit) as { url: string; title: string; visited_at: number }[];
  return rows
    .filter((row) => typeof row.url === 'string' && isImportableHistoryUrl(row.url))
    .map((row) => ({ url: row.url, title: row.title ?? '', visitedAt: Number(row.visited_at) }));
}

/**
 * Datos de perfiles de `Local State`: el nombre visible de cada directorio
 * (`profile.info_cache`, p. ej. `{ "Default": "Persona 1" }`) y el último
 * usado (`profile.last_used`), que se propone por defecto.
 */
export function parseChromiumLocalState(json: unknown): { names: Record<string, string>; lastUsed: string | null } {
  const empty = { names: {}, lastUsed: null };
  if (typeof json !== 'object' || json === null) return empty;
  const profile = (json as { profile?: unknown }).profile;
  if (typeof profile !== 'object' || profile === null) return empty;
  const lastUsedRaw = (profile as { last_used?: unknown }).last_used;
  const lastUsed = typeof lastUsedRaw === 'string' && lastUsedRaw ? lastUsedRaw : null;
  const cache = (profile as { info_cache?: unknown }).info_cache;
  const names: Record<string, string> = {};
  if (typeof cache === 'object' && cache !== null) {
    for (const [dir, info] of Object.entries(cache as Record<string, unknown>)) {
      const name = typeof info === 'object' && info !== null ? (info as { name?: unknown }).name : undefined;
      names[dir] = typeof name === 'string' && name.trim() ? name : dir;
    }
  }
  return { names, lastUsed };
}

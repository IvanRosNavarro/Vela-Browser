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

/** Firefox guarda las fechas en microsegundos desde el epoch de Unix. */
export function firefoxTimeToUnixMs(microsSinceEpoch: number | bigint): number {
  const micros = typeof microsSinceEpoch === 'bigint' ? microsSinceEpoch : BigInt(Math.trunc(microsSinceEpoch));
  return Number(micros / 1000n);
}

// moz_bookmarks.type
const TYPE_BOOKMARK = 1;
const TYPE_FOLDER = 2;

// guid fijos de las raíces de places.sqlite. `tags________` queda fuera: sus
// "carpetas" son etiquetas, no una jerarquía que el usuario haya creado.
const ROOTS: { guid: string; title: string }[] = [
  { guid: 'toolbar_____', title: ROOT_FOLDER_TITLES.toolbar },
  { guid: 'menu________', title: ROOT_FOLDER_TITLES.menu },
  { guid: 'unfiled_____', title: ROOT_FOLDER_TITLES.other },
  { guid: 'mobile______', title: ROOT_FOLDER_TITLES.mobile },
];

interface BookmarkRow {
  id: number;
  type: number;
  parent: number;
  title: string | null;
  guid: string | null;
  url: string | null;
}

/**
 * Árbol de marcadores de `places.sqlite`, con las raíces renombradas en
 * castellano. Omite separadores, consultas guardadas (`place:`) y las
 * direcciones que Vela no puede abrir.
 */
export function readFirefoxBookmarks(db: DatabaseSync): ImportedFolder[] {
  const rows = db
    .prepare(
      `SELECT b.id AS id, b.type AS type, b.parent AS parent, b.title AS title,
              b.guid AS guid, p.url AS url
         FROM moz_bookmarks b
         LEFT JOIN moz_places p ON p.id = b.fk
        ORDER BY b.parent, b.position`,
    )
    .all() as unknown as BookmarkRow[];

  const byParent = new Map<number, BookmarkRow[]>();
  for (const row of rows) {
    const list = byParent.get(row.parent);
    if (list) list.push(row);
    else byParent.set(row.parent, [row]);
  }

  const build = (parentId: number, depth: number): ImportedNode[] => {
    if (depth > MAX_DEPTH) return [];
    const out: ImportedNode[] = [];
    for (const row of byParent.get(parentId) ?? []) {
      if (row.id === parentId) continue;
      if (row.type === TYPE_BOOKMARK) {
        if (!row.url || !isAllowedFavoriteUrl(row.url)) continue;
        out.push({ kind: 'bookmark', title: row.title ?? '', url: row.url });
      } else if (row.type === TYPE_FOLDER) {
        out.push({ kind: 'folder', title: row.title || 'Carpeta', children: build(row.id, depth + 1) });
      }
    }
    return out;
  };

  const out: ImportedFolder[] = [];
  for (const root of ROOTS) {
    const row = rows.find((r) => r.guid === root.guid);
    if (!row) continue;
    const children = build(row.id, 1);
    if (children.length > 0) out.push({ kind: 'folder', title: root.title, children });
  }
  return out;
}

/**
 * Visitas de `places.sqlite`, de la más reciente hacia atrás. Descarta las
 * cargas embebidas (4), descargas (7) y enlaces en frames (8), que Firefox
 * tampoco muestra como páginas visitadas.
 */
export function readFirefoxHistory(db: DatabaseSync, opts: HistoryReadOptions): ImportedVisit[] {
  const rows = db
    .prepare(
      `SELECT p.url AS url, COALESCE(p.title, '') AS title, v.visit_date / 1000 AS visited_at
         FROM moz_historyvisits v
         JOIN moz_places p ON p.id = v.place_id
        WHERE v.visit_type NOT IN (4, 7, 8)
          AND v.visit_date / 1000 >= ?
        ORDER BY v.visit_date DESC
        LIMIT ?`,
    )
    .all(opts.since, opts.limit) as { url: string; title: string; visited_at: number }[];
  return rows
    .filter((row) => typeof row.url === 'string' && isImportableHistoryUrl(row.url))
    .map((row) => ({ url: row.url, title: row.title ?? '', visitedAt: Number(row.visited_at) }));
}

export interface FirefoxProfileEntry {
  name: string;
  /** Ruta tal cual aparece en profiles.ini. */
  path: string;
  isRelative: boolean;
  isDefault: boolean;
}

/**
 * Perfiles de `profiles.ini`. El perfil por defecto sale de la sección
 * `[Install…]` (Firefox ≥ 67) o, si no la hay, de `Default=1`.
 */
export function parseProfilesIni(text: string): FirefoxProfileEntry[] {
  const sections: { name: string; values: Record<string, string> }[] = [];
  let current: { name: string; values: Record<string, string> } | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      current = { name: header[1]!, values: {} };
      sections.push(current);
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1 || !current) continue;
    current.values[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }

  const installDefaults = new Set(
    sections
      .filter((s) => s.name.startsWith('Install') && s.values['Default'])
      .map((s) => s.values['Default']!),
  );

  const profiles: FirefoxProfileEntry[] = [];
  for (const s of sections) {
    if (!/^Profile\d+$/.test(s.name)) continue;
    const p = s.values['Path'];
    if (!p) continue;
    profiles.push({
      name: s.values['Name'] || p,
      path: p,
      isRelative: s.values['IsRelative'] !== '0',
      isDefault: installDefaults.size > 0 ? installDefaults.has(p) : s.values['Default'] === '1',
    });
  }
  return profiles;
}

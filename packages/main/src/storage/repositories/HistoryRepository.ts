import type { DatabaseSync } from 'node:sqlite';

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  visitedAt: number;
  workspaceId: string;
  sessionId: string;
}

export interface HistorySession {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  entryCount: number;
  workspaceIds: string[];
}

export interface DomainStat {
  domain: string;
  visitCount: number;
  lastVisitedAt: number;
  favicon: string | null;
}

interface HistoryRow {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  visited_at: number;
  workspace_id: string;
  session_id: string;
}

interface SessionRow {
  day: string;
  started_at: number;
  ended_at: number;
  entry_count: number;
  workspace_ids: string;
}

type SqlParam = string | number | null;

function rowToEntry(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    favicon: row.favicon,
    visitedAt: row.visited_at,
    workspaceId: row.workspace_id,
    sessionId: row.session_id,
  };
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Compleción inline propuesta para lo escrito en la barra de direcciones. */
export interface AutocompleteMatch {
  /** Forma visible que empieza por lo escrito (sin distinguir mayúsculas). */
  text: string;
  /** Destino real de la navegación. */
  url: string;
}

/**
 * Fuente adicional de candidatos (favoritos, pestañas abiertas). Su `score`
 * se suma al de las visitas del historial a la misma URL.
 */
export interface AutocompleteExtraCandidate {
  url: string;
  score: number;
}

interface AutocompleteRow {
  url: string;
  score: number;
  last_visit: number;
}

interface AutocompleteCandidate {
  url: string;
  score: number;
  lastVisit: number;
}

const DAY_MS = 86_400_000;
/** Tope de URLs distintas por variante de prefijo: acota el coste por tecla. */
const AUTOCOMPLETE_ROW_LIMIT = 200;

/**
 * Formas visibles de una URL, de la más corta a la más larga: sin esquema ni
 * `www.`, sin esquema, y completa. La compleción usa la primera que empiece
 * por lo escrito, así `gi` completa a `github.com/` y `www.gi` a
 * `www.github.com/`.
 */
function displayForms(url: string): string[] {
  const noScheme = url.replace(/^https?:\/\//i, '');
  const noWww = noScheme.replace(/^www\./i, '');
  return [...new Set([noWww, noScheme, url])];
}

function matchText(url: string, typedLower: string): string | null {
  for (const form of displayForms(url)) {
    if (form.toLowerCase().startsWith(typedLower)) return form;
  }
  return null;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function originRoot(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.host}/`;
  } catch {
    return null;
  }
}

/** Agrupa candidatos por origen (`https://host/`) sumando su puntuación. */
function aggregateByOrigin(
  candidates: Iterable<AutocompleteCandidate>,
): AutocompleteCandidate[] {
  const origins = new Map<string, AutocompleteCandidate>();
  for (const c of candidates) {
    const root = originRoot(c.url);
    if (!root) continue;
    const acc = origins.get(root);
    if (acc) {
      acc.score += c.score;
      acc.lastVisit = Math.max(acc.lastVisit, c.lastVisit);
    } else {
      origins.set(root, { url: root, score: c.score, lastVisit: c.lastVisit });
    }
  }
  return [...origins.values()];
}

function isBetter(a: AutocompleteCandidate, b: AutocompleteCandidate | null): boolean {
  if (!b) return true;
  if (a.score !== b.score) return a.score > b.score;
  if (a.lastVisit !== b.lastVisit) return a.lastVisit > b.lastVisit;
  return a.url.length < b.url.length;
}

export class HistoryRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(entry: HistoryEntry): void {
    try {
      this.db.prepare(
        `INSERT OR IGNORE INTO history
           (id, url, title, favicon, visited_at, workspace_id, session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        entry.id,
        entry.url,
        entry.title,
        entry.favicon ?? null,
        entry.visitedAt,
        entry.workspaceId,
        entry.sessionId,
      );
    } catch {
      // Graceful degradation: history table may not exist in older DBs
    }
  }

  search(query: string, opts?: {
    workspaceId?: string;
    limit?: number;
    offset?: number;
    from?: number;
    to?: number;
  }): HistoryEntry[] {
    try {
      const pattern = `%${query}%`;
      const limit = opts?.limit ?? 10;
      const offset = opts?.offset ?? 0;
      const parts: string[] = ['(title LIKE ? OR url LIKE ?)'];
      const params: SqlParam[] = [pattern, pattern];

      if (opts?.workspaceId) {
        parts.push('workspace_id = ?');
        params.push(opts.workspaceId);
      }
      if (opts?.from !== undefined) {
        parts.push('visited_at >= ?');
        params.push(opts.from);
      }
      if (opts?.to !== undefined) {
        parts.push('visited_at <= ?');
        params.push(opts.to);
      }

      params.push(limit, offset);

      const rows = this.db.prepare(
        `SELECT id, url, title, favicon, visited_at, workspace_id, session_id
         FROM history
         WHERE ${parts.join(' AND ')}
         ORDER BY visited_at DESC
         LIMIT ? OFFSET ?`,
      ).all(...params) as HistoryRow[];
      return rows.map(rowToEntry);
    } catch {
      return [];
    }
  }

  getRecent(limit: number = 10): HistoryEntry[] {
    try {
      const rows = this.db.prepare(
        `SELECT id, url, title, favicon, visited_at, workspace_id, session_id
         FROM history
         ORDER BY visited_at DESC
         LIMIT ?`,
      ).all(limit) as HistoryRow[];
      return rows.map(rowToEntry);
    } catch {
      return [];
    }
  }

  /**
   * Compleción inline de la barra de direcciones. Busca URLs http(s) cuya
   * forma visible (sin esquema ni `www.`) empiece por `prefix` y las ordena
   * por frecencia: cada visita puntúa según su antigüedad (100 si es de los
   * últimos 4 días, 70 hasta 14, 50 hasta 31, 30 hasta 90 y 10 después).
   *
   * Si lo escrito no pasa del host, completa hasta el host (`github.com/`)
   * sumando la puntuación de todas las URLs de cada origen; si ya incluye
   * ruta, completa hasta la URL visitada con más puntuación.
   *
   * Se llama a cada tecla: la búsqueda recorre el índice `idx_history_url`
   * por rango (el host se compara en minúsculas, que es como Chromium lo
   * normaliza) y el `LIKE` solo filtra dentro de ese rango, para que la ruta
   * no distinga mayúsculas.
   */
  autocomplete(
    prefix: string,
    opts?: { now?: number; extra?: AutocompleteExtraCandidate[] },
  ): AutocompleteMatch | null {
    const typed = prefix.trim();
    if (typed.length === 0 || /\s/.test(typed)) return null;
    const typedLower = typed.toLowerCase();

    const schemeMatch = /^(https?):\/\//i.exec(typed);
    const rest = schemeMatch ? typed.slice(schemeMatch[0].length) : typed;
    if (rest.length === 0) return null;
    const bases = schemeMatch
      ? [`${schemeMatch[1]!.toLowerCase()}://`]
      : rest.toLowerCase().startsWith('www.')
        ? ['https://', 'http://']
        : ['https://', 'http://', 'https://www.', 'http://www.'];

    const hostEnd = rest.search(/[/?#]/);
    const beyondHost = hostEnd !== -1;
    const hostPart = (beyondHost ? rest.slice(0, hostEnd) : rest).toLowerCase();

    const now = opts?.now ?? Date.now();
    const candidates = new Map<string, AutocompleteCandidate>();

    try {
      const stmt = this.db.prepare(
        `SELECT url,
                MAX(visited_at) AS last_visit,
                SUM(CASE
                      WHEN visited_at >= ? THEN 100
                      WHEN visited_at >= ? THEN 70
                      WHEN visited_at >= ? THEN 50
                      WHEN visited_at >= ? THEN 30
                      ELSE 10
                    END) AS score
         FROM history
         WHERE url >= ? AND url < ? AND url LIKE ? ESCAPE '\\'
         GROUP BY url
         ORDER BY score DESC, last_visit DESC
         LIMIT ?`,
      );
      for (const base of bases) {
        const rangeStart = base + hostPart;
        const rows = stmt.all(
          now - 4 * DAY_MS,
          now - 14 * DAY_MS,
          now - 31 * DAY_MS,
          now - 90 * DAY_MS,
          rangeStart,
          `${rangeStart}￿`,
          `${base}${escapeLike(rest)}%`,
          AUTOCOMPLETE_ROW_LIMIT,
        ) as unknown as AutocompleteRow[];
        for (const row of rows) {
          if (!candidates.has(row.url)) {
            candidates.set(row.url, {
              url: row.url,
              score: row.score,
              lastVisit: row.last_visit,
            });
          }
        }
      }
    } catch {
      // Graceful degradation: tabla history ausente en BDs antiguas.
    }

    for (const extra of opts?.extra ?? []) {
      if (!/^https?:\/\//i.test(extra.url)) continue;
      if (matchText(extra.url, typedLower) === null) continue;
      const existing = candidates.get(extra.url);
      if (existing) existing.score += extra.score;
      else candidates.set(extra.url, { url: extra.url, score: extra.score, lastVisit: 0 });
    }

    const pool = beyondHost
      ? [...candidates.values()]
      : aggregateByOrigin(candidates.values());
    let best: AutocompleteMatch | null = null;
    let bestCandidate: AutocompleteCandidate | null = null;
    for (const c of pool) {
      const text = matchText(c.url, typedLower);
      if (text === null || !isBetter(c, bestCandidate)) continue;
      bestCandidate = c;
      best = { text, url: c.url };
    }
    return best;
  }

  updateFaviconForUrl(url: string, favicon: string): void {
    try {
      this.db.prepare(
        `UPDATE history SET favicon = ? WHERE url = ? AND favicon IS NULL`,
      ).run(favicon, url);
    } catch { /* ignorar */ }
  }

  getFaviconForUrl(url: string): string | null {
    try {
      const row = this.db.prepare(
        `SELECT favicon FROM history WHERE url = ? AND favicon IS NOT NULL ORDER BY visited_at DESC LIMIT 1`,
      ).get(url) as { favicon: string } | undefined;
      return row?.favicon ?? null;
    } catch {
      return null;
    }
  }

  getSessions(workspaceId?: string): HistorySession[] {
    try {
      const params: SqlParam[] = [];
      const where = workspaceId
        ? (params.push(workspaceId), 'WHERE workspace_id = ?')
        : '';

      const rows = this.db.prepare(
        `SELECT
           date(visited_at / 1000, 'unixepoch') AS day,
           MIN(visited_at) AS started_at,
           MAX(visited_at) AS ended_at,
           COUNT(*) AS entry_count,
           GROUP_CONCAT(DISTINCT workspace_id) AS workspace_ids
         FROM history
         ${where}
         GROUP BY day
         ORDER BY day DESC`,
      ).all(...params) as SessionRow[];

      return rows.map((r) => ({
        sessionId: r.day,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        entryCount: r.entry_count,
        workspaceIds: r.workspace_ids ? r.workspace_ids.split(',') : [],
      }));
    } catch {
      return [];
    }
  }

  getByDomain(domain: string, workspaceId?: string): HistoryEntry[] {
    try {
      if (workspaceId) {
        const rows = this.db.prepare(
          `SELECT id, url, title, favicon, visited_at, workspace_id, session_id
           FROM history
           WHERE url LIKE ? AND workspace_id = ?
           ORDER BY visited_at DESC`,
        ).all(`%${domain}%`, workspaceId) as HistoryRow[];
        return rows.map(rowToEntry);
      }
      const rows = this.db.prepare(
        `SELECT id, url, title, favicon, visited_at, workspace_id, session_id
         FROM history
         WHERE url LIKE ?
         ORDER BY visited_at DESC`,
      ).all(`%${domain}%`) as HistoryRow[];
      return rows.map(rowToEntry);
    } catch {
      return [];
    }
  }

  getDomainStats(workspaceId?: string): DomainStat[] {
    try {
      interface RawRow { url: string; visit_count: number; last_visited_at: number; favicon: string | null }
      const rows: RawRow[] = workspaceId
        ? (this.db.prepare(
            `SELECT url, COUNT(*) AS visit_count, MAX(visited_at) AS last_visited_at, favicon
             FROM history WHERE workspace_id = ?
             GROUP BY url ORDER BY visit_count DESC`,
          ).all(workspaceId) as RawRow[])
        : (this.db.prepare(
            `SELECT url, COUNT(*) AS visit_count, MAX(visited_at) AS last_visited_at, favicon
             FROM history GROUP BY url ORDER BY visit_count DESC`,
          ).all() as RawRow[]);

      const domainMap = new Map<string, DomainStat>();
      for (const row of rows) {
        const domain = getDomain(row.url);
        const existing = domainMap.get(domain);
        if (!existing) {
          domainMap.set(domain, {
            domain,
            visitCount: row.visit_count,
            lastVisitedAt: row.last_visited_at,
            favicon: row.favicon,
          });
        } else {
          existing.visitCount += row.visit_count;
          if (row.last_visited_at > existing.lastVisitedAt) {
            existing.lastVisitedAt = row.last_visited_at;
            if (row.favicon) existing.favicon = row.favicon;
          }
        }
      }

      return [...domainMap.values()].sort((a, b) => b.visitCount - a.visitCount);
    } catch {
      return [];
    }
  }

  delete(id: string): void {
    try {
      this.db.prepare('DELETE FROM history WHERE id = ?').run(id);
    } catch {
      // graceful
    }
  }

  deleteByDomain(domain: string): void {
    try {
      const rows = this.db.prepare(
        'SELECT id, url FROM history',
      ).all() as Array<{ id: string; url: string }>;

      const stmt = this.db.prepare('DELETE FROM history WHERE id = ?');
      for (const row of rows) {
        if (getDomain(row.url) === domain) {
          stmt.run(row.id);
        }
      }
    } catch {
      // graceful
    }
  }

  deleteAll(workspaceId?: string): void {
    try {
      if (workspaceId) {
        this.db.prepare('DELETE FROM history WHERE workspace_id = ?').run(workspaceId);
      } else {
        this.db.prepare('DELETE FROM history').run();
      }
    } catch {
      // graceful
    }
  }

  getForPeriod(from: number, to: number, workspaceId?: string): HistoryEntry[] {
    try {
      if (workspaceId) {
        const rows = this.db.prepare(
          `SELECT id, url, title, favicon, visited_at, workspace_id, session_id
           FROM history
           WHERE visited_at >= ? AND visited_at <= ? AND workspace_id = ?
           ORDER BY visited_at DESC`,
        ).all(from, to, workspaceId) as HistoryRow[];
        return rows.map(rowToEntry);
      }
      const rows = this.db.prepare(
        `SELECT id, url, title, favicon, visited_at, workspace_id, session_id
         FROM history
         WHERE visited_at >= ? AND visited_at <= ?
         ORDER BY visited_at DESC`,
      ).all(from, to) as HistoryRow[];
      return rows.map(rowToEntry);
    } catch {
      return [];
    }
  }

  deleteOlderThan(cutoffMs: number): void {
    try {
      this.db.prepare('DELETE FROM history WHERE visited_at < ?').run(cutoffMs);
    } catch {
      // graceful
    }
  }
}

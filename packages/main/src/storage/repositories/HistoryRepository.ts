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

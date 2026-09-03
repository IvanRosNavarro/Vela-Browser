import type { DatabaseSync } from 'node:sqlite';
import { syncEvents } from '../../sync/syncEvents';

interface ExceptionRow {
  id: string;
  domain: string;
  created_at: number;
  updated_at: number | null;
}

export class AdblockerExceptionsRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly profileId?: string,
  ) {}

  list(): string[] {
    try {
      const rows = this.db
        .prepare('SELECT domain FROM adblocker_exceptions ORDER BY created_at ASC')
        .all() as Array<{ domain: string }>;
      return rows.map((r) => r.domain);
    } catch {
      return [];
    }
  }

  /** Filas completas, para el push inicial de sincronización. */
  listAll(): Array<{ id: string; domain: string; updatedAt: number }> {
    try {
      const rows = this.db
        .prepare('SELECT id, domain, created_at, updated_at FROM adblocker_exceptions')
        .all() as ExceptionRow[];
      return rows.map((r) => ({
        id: r.id,
        domain: r.domain,
        updatedAt: r.updated_at ?? r.created_at,
      }));
    } catch {
      return [];
    }
  }

  add(domain: string): void {
    try {
      const id = crypto.randomUUID();
      const now = Date.now();
      this.db
        .prepare(
          'INSERT OR IGNORE INTO adblocker_exceptions (id, domain, created_at, updated_at) VALUES (?, ?, ?, ?)',
        )
        .run(id, domain, now, now);
      // Emitir sync solo si la fila se insertó (si ya existía, OR IGNORE la descarta)
      const row = this.db
        .prepare('SELECT id, domain, created_at, updated_at FROM adblocker_exceptions WHERE domain = ?')
        .get(domain) as ExceptionRow | undefined;
      if (row) this.emitSyncChange(row);
    } catch { /* tabla no disponible en perfil pre-migración */ }
  }

  remove(domain: string): void {
    try {
      const row = this.db
        .prepare('SELECT id FROM adblocker_exceptions WHERE domain = ?')
        .get(domain) as { id: string } | undefined;
      this.db.prepare('DELETE FROM adblocker_exceptions WHERE domain = ?').run(domain);
      if (row) this.emitSyncDelete(row.id);
    } catch { /* ignore */ }
  }

  has(domain: string): boolean {
    try {
      const row = this.db
        .prepare('SELECT 1 FROM adblocker_exceptions WHERE domain = ?')
        .get(domain);
      return !!row;
    } catch {
      return false;
    }
  }

  /** Upsert desde sync remoto — no emite syncEvents. */
  syncUpsert(data: { id: string; domain: string; updatedAt: number }): void {
    try {
      this.db
        .prepare(
          `INSERT INTO adblocker_exceptions (id, domain, created_at, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             domain     = excluded.domain,
             updated_at = excluded.updated_at
           WHERE excluded.updated_at > adblocker_exceptions.updated_at`,
        )
        .run(data.id, data.domain, data.updatedAt, data.updatedAt);
    } catch { /* ignore pre-migración */ }
  }

  deleteById(id: string): void {
    try {
      this.db.prepare('DELETE FROM adblocker_exceptions WHERE id = ?').run(id);
    } catch { /* ignore */ }
  }

  getUpdatedAt(id: string): number | null {
    try {
      const row = this.db
        .prepare('SELECT updated_at, created_at FROM adblocker_exceptions WHERE id = ?')
        .get(id) as ExceptionRow | undefined;
      return row ? (row.updated_at ?? row.created_at) : null;
    } catch {
      return null;
    }
  }

  private emitSyncChange(row: ExceptionRow): void {
    if (!this.profileId) return;
    syncEvents.emit('entity:changed', {
      profileId: this.profileId,
      type: 'adblocker_exception',
      id: row.id,
      data: {
        id: row.id,
        domain: row.domain,
        updatedAt: row.updated_at ?? row.created_at,
      },
      updatedAt: row.updated_at ?? row.created_at,
    });
  }

  private emitSyncDelete(id: string): void {
    if (!this.profileId) return;
    syncEvents.emit('entity:changed', {
      profileId: this.profileId,
      type: 'adblocker_exception',
      id,
      data: null,
      updatedAt: Date.now(),
    });
  }
}

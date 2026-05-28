import type { DatabaseSync } from 'node:sqlite';

export interface SyncPendingItem {
  entity_type: string;
  entity_id: string;
  data_json: string | null;
  updated_at: number;
  queued_at: number;
}

export class SyncPendingRepository {
  constructor(private readonly db: DatabaseSync) {}

  upsert(
    entityType: string,
    entityId: string,
    dataJson: string | null,
    updatedAt: number,
  ): void {
    this.db
      .prepare(
        `INSERT INTO sync_pending (entity_type, entity_id, data_json, updated_at, queued_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET
           data_json  = excluded.data_json,
           updated_at = excluded.updated_at,
           queued_at  = excluded.queued_at`,
      )
      .run(entityType, entityId, dataJson, updatedAt, Date.now());
  }

  listAll(): SyncPendingItem[] {
    return this.db
      .prepare('SELECT * FROM sync_pending ORDER BY queued_at ASC')
      .all() as SyncPendingItem[];
  }

  clearAll(): void {
    this.db.prepare('DELETE FROM sync_pending').run();
  }

  remove(entityType: string, entityId: string): void {
    this.db
      .prepare('DELETE FROM sync_pending WHERE entity_type = ? AND entity_id = ?')
      .run(entityType, entityId);
  }
}

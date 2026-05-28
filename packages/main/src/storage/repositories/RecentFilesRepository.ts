import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export interface RecentFile {
  id: string;
  path: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  usedAt: number;
  profileId: string;
}

interface RecentFileRow {
  id: string;
  path: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  used_at: number;
  profile_id: string;
}

export class RecentFilesRepository {
  constructor(private readonly db: DatabaseSync) {}

  list(profileId: string, limit: number): RecentFile[] {
    const rows = this.db
      .prepare(
        `SELECT id, path, name, mime_type, size_bytes, used_at, profile_id
         FROM recent_files
         WHERE profile_id = ?
         ORDER BY used_at DESC
         LIMIT ?`,
      )
      .all(profileId, limit) as RecentFileRow[];

    return rows.map(this.fromRow);
  }

  upsert(
    profileId: string,
    file: { path: string; name: string; mimeType: string; sizeBytes: number },
  ): void {
    const existing = this.db
      .prepare('SELECT id FROM recent_files WHERE profile_id = ? AND path = ?')
      .get(profileId, file.path) as { id: string } | undefined;

    const id = existing?.id ?? randomUUID();
    const now = Date.now();

    this.db
      .prepare(
        `INSERT INTO recent_files (id, path, name, mime_type, size_bytes, used_at, profile_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(profile_id, path) DO UPDATE SET
           name       = excluded.name,
           mime_type  = excluded.mime_type,
           size_bytes = excluded.size_bytes,
           used_at    = excluded.used_at`,
      )
      .run(id, file.path, file.name, file.mimeType, file.sizeBytes, now, profileId);
  }

  delete(profileId: string, filePath: string): void {
    this.db
      .prepare('DELETE FROM recent_files WHERE profile_id = ? AND path = ?')
      .run(profileId, filePath);
  }

  clearAll(profileId: string): void {
    this.db.prepare('DELETE FROM recent_files WHERE profile_id = ?').run(profileId);
  }

  private fromRow(row: RecentFileRow): RecentFile {
    return {
      id: row.id,
      path: row.path,
      name: row.name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      usedAt: row.used_at,
      profileId: row.profile_id,
    };
  }
}

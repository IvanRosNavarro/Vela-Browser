import type { DatabaseSync } from 'node:sqlite';

interface MetadataRow {
  value: string;
}

export class AppMetadataRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM app_metadata WHERE key = ?')
      .get(key) as MetadataRow | undefined;
    return row ? row.value : null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO app_metadata (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM app_metadata WHERE key = ?').run(key);
  }
}

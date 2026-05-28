import type { DatabaseSync } from 'node:sqlite';

interface MetadataRow {
  value: string;
}

/**
 * Key-value store por perfil (vive en profile.db, no en vela.db). Misma forma
 * que AppMetadataRepository pero apunta a la tabla `profile_metadata` para no
 * mezclar scopes: app_metadata es global de la app, profile_metadata pertenece
 * al perfil concreto y se cierra cuando el perfil se cierra.
 */
export class ProfileMetadataRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM profile_metadata WHERE key = ?')
      .get(key) as MetadataRow | undefined;
    return row ? row.value : null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO profile_metadata (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM profile_metadata WHERE key = ?').run(key);
  }
}

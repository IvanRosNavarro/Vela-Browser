import type { DatabaseSync } from 'node:sqlite';

interface SettingsRow {
  key: string;
  value: string;
}

/**
 * Repositorio key/value sobre la tabla `settings_profile` de profile.db.
 * Aloja ajustes que pertenecen a un perfil concreto (tema, motor de búsqueda,
 * scope MRU, etc.). Los valores se almacenan como TEXT; la serialización a
 * JSON la hace el caller (`ProfileSettings`/handlers IPC), igual que
 * AppMetadataRepository hace con app_metadata. Convivimos así con
 * `profile_metadata` (estado del perfil, no preferencias) sin mezclar scopes.
 */
export class ProfileSettingsRepository {
  constructor(private readonly db: DatabaseSync) {}

  get(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM settings_profile WHERE key = ?')
      .get(key) as SettingsRow | undefined;
    return row ? row.value : null;
  }

  set(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings_profile (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  /** Upsert desde sync remoto — no emite eventos. */
  syncSet(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings_profile (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  getUpdatedAt(key: string): number | null {
    const row = this.db
      .prepare('SELECT updated_at FROM settings_profile WHERE key = ?')
      .get(key) as { updated_at: number | null } | undefined;
    return row?.updated_at ?? null;
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM settings_profile WHERE key = ?').run(key);
  }

  list(): Record<string, string> {
    const rows = this.db
      .prepare('SELECT key, value FROM settings_profile')
      .all() as SettingsRow[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}

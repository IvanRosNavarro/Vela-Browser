import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { logger } from '../logger';
import { transaction } from './db';

const PROFILE_MIGRATION_FILES = import.meta.glob(
  './profile-migrations/*.sql',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

interface MigrationRow {
  name: string;
}

interface PreparedMigration {
  name: string;
  sql: string;
}

/**
 * Aplica todas las migraciones pendientes de `profile-migrations/` a la BD de
 * un perfil concreto. Es idempotente: la tabla `schema_migrations` registra
 * cada nombre aplicado y se ignoran los repetidos.
 *
 * Tiene dos formas de uso:
 *   - `runMigrations()`: abre la BD en `dbPath`, aplica las migraciones y la
 *     cierra. Útil cuando solo se quiere garantizar que profile.db está al día
 *     sin mantenerla abierta (ej.: tras `createProfile` antes del primer
 *     `openProfile`).
 *   - `applyTo(db)`: aplica las migraciones sobre una conexión ya abierta.
 *     `openProfileDb` lo usa para asegurar que la BD viene siempre con el
 *     esquema actual antes de instanciar los repositorios.
 */
export class ProfileMigrationRunner {
  constructor(private readonly dbPath: string) {}

  async runMigrations(): Promise<void> {
    const db = new DatabaseSync(this.dbPath);
    try {
      db.exec('PRAGMA journal_mode = WAL');
      db.exec('PRAGMA foreign_keys = ON');
      db.exec('PRAGMA busy_timeout = 5000');
      ProfileMigrationRunner.applyTo(db);
    } finally {
      db.close();
    }
  }

  static applyTo(db: DatabaseSync): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const appliedRows = db
      .prepare('SELECT name FROM schema_migrations')
      .all() as MigrationRow[];
    const applied = new Set(appliedRows.map((r) => r.name));

    const pending: PreparedMigration[] = Object.entries(PROFILE_MIGRATION_FILES)
      .map(([file, sql]) => ({ name: path.basename(file), sql }))
      .filter(({ name }) => /^\d+-.+\.sql$/.test(name))
      .sort((a, b) => a.name.localeCompare(b.name));

    let appliedCount = 0;
    for (const { name, sql } of pending) {
      if (applied.has(name)) {
        logger.debug(`[profile-db] migración ya aplicada: ${name}`);
        continue;
      }
      transaction(db, () => {
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
      });
      logger.info(`[profile-db] migración aplicada: ${name}`);
      appliedCount++;
    }

    logger.info(
      `[profile-db] migraciones: ${appliedCount} nuevas, ${pending.length - appliedCount} ya aplicadas`,
    );
  }
}

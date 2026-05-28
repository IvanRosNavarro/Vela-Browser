import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { app } from 'electron';
import { logger } from '../logger';

const MIGRATION_FILES = import.meta.glob('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

interface MigrationRow {
  name: string;
}

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) {
    throw new Error('Storage no inicializado. Llama a initStorage() en app.whenReady.');
  }
  return db;
}

export function initStorage(): DatabaseSync {
  if (db) return db;

  const userDataDir = app.getPath('userData');
  fs.mkdirSync(userDataDir, { recursive: true });
  const dbPath = path.join(userDataDir, 'vela.db');

  logger.info(`[storage] Abriendo BD: ${dbPath}`);
  db = new DatabaseSync(dbPath);

  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  applyMigrations(db);
  upsertAppVersion(db);

  return db;
}

export function closeStorage(): void {
  if (!db) return;
  db.close();
  db = null;
}

function applyMigrations(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const appliedRows = database
    .prepare('SELECT name FROM schema_migrations')
    .all() as MigrationRow[];
  const applied = new Set(appliedRows.map((r) => r.name));

  const pending = Object.entries(MIGRATION_FILES)
    .map(([file, sql]) => ({ name: path.basename(file), sql }))
    .filter(({ name }) => /^\d+-.+\.sql$/.test(name))
    .sort((a, b) => a.name.localeCompare(b.name));

  let appliedCount = 0;
  for (const { name, sql } of pending) {
    if (applied.has(name)) {
      logger.debug(`[storage] migración ya aplicada: ${name}`);
      continue;
    }
    transaction(database, () => {
      database.exec(sql);
      database
        .prepare('INSERT INTO schema_migrations (name) VALUES (?)')
        .run(name);
    });
    logger.info(`[storage] migración aplicada: ${name}`);
    appliedCount++;
  }

  logger.info(
    `[storage] migraciones: ${appliedCount} nuevas, ${pending.length - appliedCount} ya aplicadas`,
  );
}

function upsertAppVersion(database: DatabaseSync): void {
  const version = app.getVersion();
  database
    .prepare(
      `INSERT INTO app_metadata (key, value) VALUES ('app_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(version);
  logger.info(`[storage] app_version=${version}`);
}

export function transaction<T>(database: DatabaseSync, fn: () => T): T {
  database.exec('BEGIN');
  try {
    const result = fn();
    database.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // si el rollback falla (BD ya cerrada, etc.), propagar el error
      // original es más útil que enmascararlo con uno secundario
    }
    throw err;
  }
}

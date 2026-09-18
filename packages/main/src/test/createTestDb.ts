import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Esquema a montar:
 * - `app`: `vela.db` (perfiles, app_metadata, window_state...).
 * - `profile`: `profile.db` de un perfil. Desde Fase 3 los workspaces, el
 *   árbol y las reglas de agrupación viven aquí; las tablas homónimas de
 *   `vela.db` son el esquema heredado de Fase 1 y ya no se migran.
 */
export type TestDbSchema = 'app' | 'profile';

const MIGRATIONS_DIR: Record<TestDbSchema, string> = {
  app: path.resolve(HERE, '../storage/migrations'),
  profile: path.resolve(HERE, '../storage/profile-migrations'),
};

export function createTestDb(schema: TestDbSchema = 'app'): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const dir = MIGRATIONS_DIR[schema];
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d+-.+\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.exec(sql);
  }
  if (schema === 'profile') seedDefaultWorkspace(db);
  return db;
}

/**
 * Workspace `default` que sembraba la migración 002 de `vela.db` y del que
 * cuelgan los tests del árbol. `profile.db` no lo trae: en un perfil real el
 * primer workspace lo crea el alta del perfil.
 */
function seedDefaultWorkspace(db: DatabaseSync): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO workspaces (id, name, icon, color, position, archived, created_at, updated_at)
     VALUES ('default', 'Default', NULL, NULL, 'a0', 0, ?, ?)`,
  ).run(now, now);
}

import { DatabaseSync } from 'node:sqlite';
import { logger } from '../logger';
import { ProfileMigrationRunner } from '../storage/ProfileMigrationRunner';

/**
 * Abre la BD del perfil en `dbPath` y deja el esquema al día. Aplicar las
 * migraciones en cada open mantiene la idempotencia entre versiones de Vela:
 * cuando se publique una nueva migración (ej.: 002-passwords.sql en el
 * Prompt 7), la primera vez que se abra un perfil existente con la versión
 * nueva la migración entrará automáticamente, sin necesidad de un upgrade
 * manual.
 */
export function openProfileDb(dbPath: string): DatabaseSync {
  logger.info(`[profile-db] abriendo: ${dbPath}`);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  ProfileMigrationRunner.applyTo(db);
  return db;
}

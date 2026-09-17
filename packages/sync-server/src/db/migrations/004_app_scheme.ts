import type Database from 'better-sqlite3';

/**
 * De qué aplicación salió el enlace mágico, para devolver al usuario a ella.
 * Vela Browser abre `vela://sync-callback`; Vela FTP, `vela-ftp://sync-callback`.
 *
 * `ALTER TABLE ADD COLUMN` no admite `IF NOT EXISTS`, así que se comprueba antes:
 * las migraciones se ejecutan en cada arranque.
 */
export function migration004(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(magic_link_tokens)').all() as Array<{ name: string }>;
  if (columns.some((c) => c.name === 'app')) return;
  db.exec(`ALTER TABLE magic_link_tokens ADD COLUMN app TEXT NOT NULL DEFAULT 'browser'`);
}

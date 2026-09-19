import type Database from 'better-sqlite3';

/**
 * Inicio de sesión por sondeo (como el "device authorization" de OAuth).
 *
 * El enlace mágico ya no depende de que el navegador que lo abre devuelva el
 * token a la app por `vela://sync-callback`: Chrome en Android bloquea a menudo
 * esa redirección, el correo puede abrirse en otro navegador u otro equipo, y
 * en Desktop la página de ajustes no se enteraba. Al pedir el enlace, el
 * cliente recibe un `login_id` secreto; al pulsar el enlace la sesión queda
 * guardada en la fila y el cliente la recoge una sola vez con
 * `POST /auth/magic-link/poll`.
 *
 * - `login_id`: identificador secreto de la solicitud (solo lo conoce la app).
 * - `session_token`: sesión creada al verificar; se borra al recogerla.
 * - `verified_at`: cuándo se pulsó el enlace.
 */
export function migration005(db: Database.Database): void {
  const columns = db.prepare('PRAGMA table_info(magic_link_tokens)').all() as Array<{ name: string }>;
  const has = (name: string): boolean => columns.some((c) => c.name === name);
  if (!has('login_id')) db.exec('ALTER TABLE magic_link_tokens ADD COLUMN login_id TEXT');
  if (!has('session_token')) db.exec('ALTER TABLE magic_link_tokens ADD COLUMN session_token TEXT');
  if (!has('verified_at')) db.exec('ALTER TABLE magic_link_tokens ADD COLUMN verified_at INTEGER');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_magic_link_login_id ON magic_link_tokens(login_id)');
}

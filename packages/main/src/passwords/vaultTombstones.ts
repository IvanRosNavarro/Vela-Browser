import type { DatabaseSync } from 'node:sqlite';

/**
 * Lápidas del vault: qué entradas se han borrado y cuándo.
 *
 * El vault viaja por sincronización como un blob con lo que existe ahora, y el
 * otro dispositivo hace upsert de lo que le llega. Sin lápidas, borrar una
 * contraseña no se propagaba nunca: el equipo que no se enteró la conservaba y
 * en su siguiente subida la resucitaba para todos.
 *
 * La lápida guarda el id y la fecha, nunca el dominio ni el usuario: saber que
 * existió una credencial no debe revelar cuál era.
 */

export type VaultTombstoneKind = 'password' | 'address' | 'card';

export interface VaultTombstone {
  id: string;
  kind: VaultTombstoneKind;
  deletedAt: number;
}

/** Pasado este plazo la lápida se poda: ver la migración 022. */
export const VAULT_TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const TABLE_BY_KIND: Record<VaultTombstoneKind, string> = {
  password: 'password_vault',
  address: 'vault_addresses',
  card: 'vault_cards',
};

export function recordTombstone(
  db: DatabaseSync,
  kind: VaultTombstoneKind,
  id: string,
  deletedAt: number = Date.now(),
): void {
  db.prepare(
    `INSERT INTO vault_tombstones (id, kind, deleted_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, deleted_at = excluded.deleted_at`,
  ).run(id, kind, deletedAt);
}

export function listTombstones(db: DatabaseSync): VaultTombstone[] {
  const rows = db
    .prepare('SELECT id, kind, deleted_at FROM vault_tombstones ORDER BY deleted_at')
    .all() as { id: string; kind: VaultTombstoneKind; deleted_at: number }[];
  return rows.map((r) => ({ id: r.id, kind: r.kind, deletedAt: r.deleted_at }));
}

/**
 * Aplica una lápida recibida: borra la entrada local si no se ha vuelto a
 * tocar después del borrado, y deja constancia para reenviarla. Un
 * `updated_at` local posterior gana (el usuario la reescribió más tarde).
 */
export function applyTombstone(
  db: DatabaseSync,
  { id, kind, deletedAt }: VaultTombstone,
): boolean {
  const table = TABLE_BY_KIND[kind];
  if (!table) return false;

  const row = db
    .prepare(`SELECT updated_at FROM ${table} WHERE id = ?`)
    .get(id) as { updated_at: number } | undefined;

  if (row && row.updated_at > deletedAt) return false;

  if (row) db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  recordTombstone(db, kind, id, deletedAt);
  return row !== undefined;
}

/** Quita las lápidas viejas. Se llama al construir el snapshot de subida. */
export function pruneTombstones(
  db: DatabaseSync,
  now: number = Date.now(),
  ttlMs: number = VAULT_TOMBSTONE_TTL_MS,
): number {
  const result = db
    .prepare('DELETE FROM vault_tombstones WHERE deleted_at < ?')
    .run(now - ttlMs);
  return Number(result.changes);
}

/**
 * Cara de repositorio de las funciones de arriba, para que viaje en
 * `ProfileRepositories` como los demás y `applyVaultSnapshot` no necesite la
 * conexión cruda.
 */
export class VaultTombstoneRepository {
  constructor(private readonly db: DatabaseSync) {}

  record(kind: VaultTombstoneKind, id: string, deletedAt?: number): void {
    recordTombstone(this.db, kind, id, deletedAt);
  }

  list(): VaultTombstone[] {
    return listTombstones(this.db);
  }

  apply(tombstone: VaultTombstone): boolean {
    return applyTombstone(this.db, tombstone);
  }

  prune(now?: number, ttlMs?: number): number {
    return pruneTombstones(this.db, now, ttlMs);
  }
}

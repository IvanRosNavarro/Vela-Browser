import { describe, expect, it, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import {
  VAULT_TOMBSTONE_TTL_MS,
  applyTombstone,
  listTombstones,
  pruneTombstones,
  recordTombstone,
} from './vaultTombstones';

function createDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE password_vault (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    username TEXT NOT NULL,
    encrypted_password BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE vault_addresses (
    id TEXT PRIMARY KEY,
    data_encrypted BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE vault_cards (
    id TEXT PRIMARY KEY,
    data_encrypted BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE vault_tombstones (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    deleted_at INTEGER NOT NULL
  )`);
  return db;
}

function insertPassword(db: DatabaseSync, id: string, updatedAt: number): void {
  db.prepare(
    `INSERT INTO password_vault (id, domain, username, encrypted_password, created_at, updated_at)
     VALUES (?, 'example.com', 'ana', X'00', ?, ?)`,
  ).run(id, updatedAt, updatedAt);
}

describe('lápidas del vault', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createDb();
  });

  it('registra el borrado sin guardar nada de la entrada', () => {
    recordTombstone(db, 'password', 'a', 1000);
    expect(listTombstones(db)).toEqual([{ id: 'a', kind: 'password', deletedAt: 1000 }]);

    const columns = db.prepare('SELECT * FROM vault_tombstones').all()[0] as object;
    expect(Object.keys(columns).sort()).toEqual(['deleted_at', 'id', 'kind']);
  });

  it('una lápida recibida borra la entrada local', () => {
    insertPassword(db, 'a', 500);
    const borrada = applyTombstone(db, { id: 'a', kind: 'password', deletedAt: 1000 });

    expect(borrada).toBe(true);
    expect(db.prepare('SELECT id FROM password_vault').all()).toEqual([]);
    // Queda registrada para reenviarla al resto de dispositivos.
    expect(listTombstones(db)).toHaveLength(1);
  });

  it('una entrada reescrita después del borrado gana a su lápida', () => {
    insertPassword(db, 'a', 2000);
    const borrada = applyTombstone(db, { id: 'a', kind: 'password', deletedAt: 1000 });

    expect(borrada).toBe(false);
    expect(db.prepare('SELECT id FROM password_vault').all()).toEqual([{ id: 'a' }]);
    expect(listTombstones(db)).toEqual([]);
  });

  it('la lápida de algo que aquí no existe se guarda igual', () => {
    // Es el caso normal: el borrado llega antes de que este equipo hubiera
    // visto siquiera la entrada, o después de haberla borrado él mismo.
    expect(applyTombstone(db, { id: 'x', kind: 'password', deletedAt: 1000 })).toBe(false);
    expect(listTombstones(db)).toHaveLength(1);
  });

  it('aplica el borrado en la tabla que toca', () => {
    db.prepare(
      `INSERT INTO vault_cards (id, data_encrypted, created_at, updated_at)
       VALUES ('c1', X'00', 1, 1)`,
    ).run();
    applyTombstone(db, { id: 'c1', kind: 'card', deletedAt: 1000 });
    expect(db.prepare('SELECT id FROM vault_cards').all()).toEqual([]);
  });

  it('poda las lápidas más viejas que el TTL', () => {
    const now = Date.now();
    recordTombstone(db, 'password', 'vieja', now - VAULT_TOMBSTONE_TTL_MS - 1);
    recordTombstone(db, 'password', 'reciente', now - 1000);

    expect(pruneTombstones(db, now)).toBe(1);
    expect(listTombstones(db).map((t) => t.id)).toEqual(['reciente']);
  });
});

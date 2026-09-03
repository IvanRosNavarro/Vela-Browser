import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { ProfileSettingsRepository } from '../storage/repositories/ProfileSettingsRepository';
import { syncEvents, type SyncEntityEvent } from './syncEvents';
import { serializers } from './serializers';
import { encrypt, decrypt, deriveKey } from './crypto';

function createSettingsDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE settings_profile (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER
  )`);
  return db;
}

describe('ProfileSettingsRepository — emisión de sync', () => {
  let db: DatabaseSync;
  let repo: ProfileSettingsRepository;
  let captured: SyncEntityEvent[];
  const listener = (evt: SyncEntityEvent): void => { captured.push(evt); };

  beforeEach(() => {
    db = createSettingsDb();
    repo = new ProfileSettingsRepository(db, 'profile-1');
    captured = [];
    syncEvents.on('entity:changed', listener);
  });

  afterEach(() => {
    syncEvents.off('entity:changed', listener);
    db.close();
  });

  it('emite entity:changed al escribir un ajuste normal', () => {
    repo.set('theme:active', 'nocturne');

    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      profileId: 'profile-1',
      type: 'setting',
      id: 'theme:active',
    });
    expect(captured[0]!.data).toMatchObject({ key: 'theme:active', value: 'nocturne' });
  });

  it('sella updated_at para que el LWW pueda comparar', () => {
    const before = Date.now();
    repo.set('search:engine', 'ddg');
    const at = repo.getUpdatedAt('search:engine');

    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThanOrEqual(before);
  });

  it('no emite ni expone claves con material sensible o local', () => {
    repo.set('sync:session-token-enc', 'xxx');
    repo.set('keyring:wrapped-key', 'yyy');
    repo.set('client-cert:choices', '{}');
    repo.set('extensions:disabled', '[]');

    expect(captured).toHaveLength(0);
    expect(repo.listSyncable()).toHaveLength(0);
  });

  it('listSyncable devuelve solo los ajustes sincronizables', () => {
    repo.set('theme:active', 'nocturne');
    repo.set('sync:last-seq', '42');

    const keys = repo.listSyncable().map((s) => s.key);
    expect(keys).toEqual(['theme:active']);
  });

  it('syncSet no reenvía al servidor lo que acaba de llegar de él', () => {
    repo.syncSet('theme:active', 'aurora');

    expect(captured).toHaveLength(0);
    expect(repo.get('theme:active')).toBe('aurora');
  });

  it('sin profileId (repos de arranque) no emite nada', () => {
    const anonymous = new ProfileSettingsRepository(db);
    anonymous.set('theme:active', 'nocturne');

    expect(captured).toHaveLength(0);
  });
});

describe('serializers.treenode', () => {
  it('incluye Anclas y Cargas para que viajen al otro dispositivo', () => {
    const node = {
      id: 'n1',
      kind: 'tab',
      parentId: null,
      workspaceId: 'w1',
      url: 'https://example.com',
      originalTitle: 'Example',
      name: null,
      favicon: null,
      position: 'a0',
      pinned: true,
      pinnedUrl: 'https://example.com/pinned',
      anchored: true,
      anchoredUrl: 'https://example.com/anchor',
      collapsed: false,
      color: null,
      icon: null,
      updatedAt: 1234,
    };

    expect(serializers['treenode']!.toSync(node)).toMatchObject({
      pinned: 1,
      pinnedUrl: 'https://example.com/pinned',
      anchored: 1,
      anchoredUrl: 'https://example.com/anchor',
      collapsed: 0,
    });
  });
});

describe('crypto de sync', () => {
  it('la misma contraseña con el mismo salt produce la misma clave', () => {
    const salt = Buffer.alloc(32, 7);
    expect(deriveKey('correo-caballo', salt)).toEqual(deriveKey('correo-caballo', salt));
  });

  it('salts distintos producen claves que no se descifran entre sí', () => {
    // Este es el fallo que impedía sincronizar: cada dispositivo generaba su
    // propio salt, así que la misma contraseña daba claves incompatibles.
    const a = deriveKey('correo-caballo', Buffer.alloc(32, 1));
    const b = deriveKey('correo-caballo', Buffer.alloc(32, 2));

    const packed = encrypt('{"hola":1}', a);
    expect(decrypt(packed, a).toString('utf-8')).toBe('{"hola":1}');
    expect(() => decrypt(packed, b)).toThrow();
  });
});

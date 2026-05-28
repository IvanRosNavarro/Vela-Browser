import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from '../../test/createTestDb';
import {
  ProfileRepository,
  ProfileNotFoundError,
  DuplicateProfileNameError,
} from './ProfileRepository';

describe('ProfileRepository', () => {
  let db: DatabaseSync;
  let repo: ProfileRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new ProfileRepository(db);
  });

  it('la migración no inserta perfiles iniciales', () => {
    expect(repo.listAll()).toEqual([]);
  });

  it('create produce un partition_id único derivado del id', () => {
    const a = repo.create({ name: 'Personal' });
    const b = repo.create({ name: 'Work' });
    expect(a.partitionId).toBe(`persist:profile-${a.id}`);
    expect(b.partitionId).toBe(`persist:profile-${b.id}`);
    expect(a.partitionId).not.toBe(b.partitionId);
    expect(repo.getByPartitionId(a.partitionId)?.id).toBe(a.id);
  });

  it('create asigna posiciones crecientes y por defecto no está archivado', () => {
    const a = repo.create({ name: 'Personal' });
    const b = repo.create({ name: 'Work' });
    expect(a.position < b.position).toBe(true);
    expect(a.archived).toBe(false);
    expect(a.lastUsedAt).toBeNull();
    expect(a.hasMasterPassword).toBe(false);
  });

  it('create rechaza nombres duplicados', () => {
    repo.create({ name: 'Personal' });
    expect(() => repo.create({ name: 'Personal' })).toThrow(
      DuplicateProfileNameError,
    );
  });

  it('update no muta partition_id (lanza error si se intenta)', () => {
    const a = repo.create({ name: 'Personal' });
    expect(() =>
      repo.update(a.id, {
        partitionId: 'persist:profile-other',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    ).toThrow();
    const reloaded = repo.getById(a.id);
    expect(reloaded?.partitionId).toBe(a.partitionId);
  });

  it('update cambia solo los campos provistos y bumpea updated_at', async () => {
    const a = repo.create({ name: 'Personal' });
    const before = a.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const updated = repo.update(a.id, {
      name: 'Privado',
      color: '#ff0000',
    });
    expect(updated.name).toBe('Privado');
    expect(updated.color).toBe('#ff0000');
    expect(updated.icon).toBe(a.icon);
    expect(updated.partitionId).toBe(a.partitionId);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('archive no elimina, solo marca el flag', () => {
    const a = repo.create({ name: 'Personal' });
    const archived = repo.archive(a.id, true);
    expect(archived.archived).toBe(true);
    expect(repo.getById(a.id)?.archived).toBe(true);
    expect(repo.list().map((p) => p.id)).not.toContain(a.id);
    expect(repo.listArchived().map((p) => p.id)).toContain(a.id);
    expect(repo.listAll().map((p) => p.id)).toContain(a.id);
    repo.archive(a.id, false);
    expect(repo.list().map((p) => p.id)).toContain(a.id);
  });

  it('list ordena por position', () => {
    const a = repo.create({ name: 'A' });
    const b = repo.create({ name: 'B' });
    const c = repo.create({ name: 'C' });
    expect(repo.list().map((p) => p.id)).toEqual([a.id, b.id, c.id]);
    // Mover C antes que A: una posición lexicográficamente anterior a la
    // primera generada por positionsAtEnd (que es 'a0').
    repo.reorder(c.id, 'Zz');
    const ordered = repo.list();
    expect(ordered.map((p) => p.id)).toEqual([c.id, a.id, b.id]);
  });

  it('delete elimina el perfil', () => {
    const a = repo.create({ name: 'Personal' });
    repo.delete(a.id);
    expect(repo.getById(a.id)).toBeNull();
  });

  it('delete y otros mutadores lanzan ProfileNotFoundError para id inexistente', () => {
    expect(() => repo.delete('does-not-exist')).toThrow(ProfileNotFoundError);
    expect(() => repo.archive('does-not-exist', true)).toThrow(
      ProfileNotFoundError,
    );
    expect(() => repo.reorder('does-not-exist', 'a0')).toThrow(
      ProfileNotFoundError,
    );
    expect(() => repo.update('does-not-exist', { name: 'Foo' })).toThrow(
      ProfileNotFoundError,
    );
    expect(() => repo.setLastUsedAt('does-not-exist', Date.now())).toThrow(
      ProfileNotFoundError,
    );
    expect(() =>
      repo.setMasterPasswordEnabled('does-not-exist', true, null),
    ).toThrow(ProfileNotFoundError);
  });

  it('setLastUsedAt actualiza la marca temporal', () => {
    const a = repo.create({ name: 'Personal' });
    expect(a.lastUsedAt).toBeNull();
    const ts = 1730000000000;
    repo.setLastUsedAt(a.id, ts);
    expect(repo.getById(a.id)?.lastUsedAt).toBe(ts);
  });

  it('setMasterPasswordEnabled cambia el flag y la pista', () => {
    const a = repo.create({ name: 'Personal' });
    expect(a.hasMasterPassword).toBe(false);
    repo.setMasterPasswordEnabled(a.id, true, 'mi pista');
    const enabled = repo.getById(a.id);
    expect(enabled?.hasMasterPassword).toBe(true);
    expect(enabled?.passwordHint).toBe('mi pista');
    repo.setMasterPasswordEnabled(a.id, false, null);
    const disabled = repo.getById(a.id);
    expect(disabled?.hasMasterPassword).toBe(false);
    expect(disabled?.passwordHint).toBeNull();
  });

  it('partition_id es UNIQUE a nivel de BD', () => {
    const a = repo.create({ name: 'Personal' });
    expect(() => {
      db.prepare(
        `INSERT INTO profiles (
           id, name, position, partition_id,
           has_master_password, archived, created_at, updated_at
         ) VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
      ).run('other-id', 'Other', 'a1', a.partitionId, Date.now(), Date.now());
    }).toThrow();
  });
});

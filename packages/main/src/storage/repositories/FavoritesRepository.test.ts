import { describe, expect, it } from 'vitest';
import { createTestDb } from '../../test/createTestDb';
import { CycleError, InvariantViolationError } from '../../lib/errors';
import { DuplicateFavoriteUrlError, FavoritesRepository } from './FavoritesRepository';

function setup() {
  const repo = new FavoritesRepository(createTestDb('profile'), 'profile-1');
  const folder = (id: string, parentId: string | null, position = 'a0') =>
    repo.createFolder({ id, title: id, position, parentId });
  const bookmark = (id: string, parentId: string | null, position = 'a0') =>
    repo.add({ id, url: `https://${id}.example/`, title: id, position, parentId });
  return { repo, folder, bookmark };
}

describe('FavoritesRepository', () => {
  it('update cambia nombre y dirección y rechaza una URL ya usada', () => {
    const { repo, bookmark, folder } = setup();
    bookmark('a', null);
    bookmark('b', null, 'a1');
    folder('f', null, 'a2');

    repo.update('a', { title: 'Nuevo', url: 'https://nuevo.example/' });
    expect(repo.getById('a')).toMatchObject({ title: 'Nuevo', url: 'https://nuevo.example/' });

    expect(() => repo.update('a', { url: 'https://b.example/' })).toThrow(DuplicateFavoriteUrlError);
    expect(() => repo.update('f', { url: 'https://x.example/' })).toThrow(InvariantViolationError);
  });

  it('move rechaza ciclos y destinos que no son carpetas', () => {
    const { repo, folder, bookmark } = setup();
    folder('raiz', null);
    folder('hija', 'raiz');
    bookmark('m', null, 'a1');

    expect(() => repo.move('raiz', 'hija', 'a0')).toThrow(CycleError);
    expect(() => repo.move('raiz', 'raiz', 'a0')).toThrow(CycleError);
    expect(() => repo.move('raiz', 'm', 'a0')).toThrow(InvariantViolationError);

    repo.move('m', 'hija', 'a0');
    expect(repo.getById('m')!.parentId).toBe('hija');
  });

  it('remove de una carpeta sube el contenido por defecto', () => {
    const { repo, folder, bookmark } = setup();
    bookmark('suelto', null, 'a0');
    folder('f', null, 'a1');
    bookmark('x', 'f', 'a0');
    bookmark('y', 'f', 'a1');

    repo.remove('f');
    expect(repo.getById('f')).toBeNull();
    const root = repo.childrenOf(null).map((f) => f.id);
    expect(root).toEqual(['suelto', 'x', 'y']);
  });

  it('remove con cascade borra todo el subárbol', () => {
    const { repo, folder, bookmark } = setup();
    folder('f', null);
    folder('sub', 'f');
    bookmark('x', 'sub');
    bookmark('fuera', null, 'a1');

    repo.remove('f', { cascade: true });
    expect(repo.list().map((f) => f.id)).toEqual(['fuera']);
  });

  it('runBatch agrupa los cambios de sync en vez de emitirlos', () => {
    const { repo, folder, bookmark } = setup();
    folder('f', null);
    bookmark('x', 'f');
    const { changes } = repo.runBatch(() => repo.remove('f', { cascade: true }));
    expect(changes.map((c) => [c.id, c.data])).toEqual([['x', null], ['f', null]]);
  });

  it('syncUpsert resuelve dos ids con la misma URL quedándose con el menor', () => {
    const { repo } = setup();
    repo.add({ id: 'b-local', url: 'https://dup.example/', title: 'Local', position: 'a0' });
    repo.syncUpsert({ id: 'a-remoto', url: 'https://dup.example/', title: 'Remoto', position: 'a0', updatedAt: Date.now() });
    expect(repo.list().map((f) => f.id)).toEqual(['a-remoto']);

    repo.syncUpsert({ id: 'z-remoto', url: 'https://dup.example/', title: 'Otro', position: 'a0', updatedAt: Date.now() });
    expect(repo.list().map((f) => f.id)).toEqual(['a-remoto']);
  });
});

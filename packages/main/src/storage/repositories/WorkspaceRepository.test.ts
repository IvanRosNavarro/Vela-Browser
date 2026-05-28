import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createTestDb } from '../../test/createTestDb';
import { WorkspaceRepository } from './WorkspaceRepository';

describe('WorkspaceRepository', () => {
  let db: DatabaseSync;
  let repo: WorkspaceRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new WorkspaceRepository(db);
  });

  it('the migration seeds a default workspace', () => {
    const all = repo.listAll();
    expect(all.map((w) => w.id)).toContain('default');
    const def = repo.getById('default');
    expect(def?.name).toBe('Default');
    expect(def?.archived).toBe(false);
  });

  it('create returns a new workspace appended at the end', () => {
    const w1 = repo.create({ name: 'Personal' });
    const w2 = repo.create({ name: 'Work' });
    expect(w1.position < w2.position).toBe(true);
    expect(w1.archived).toBe(false);
    expect(w2.archived).toBe(false);
    const list = repo.list();
    expect(list.map((w) => w.name)).toEqual(['Default', 'Personal', 'Work']);
  });

  it('list excludes archived workspaces, listAll keeps them', () => {
    const w = repo.create({ name: 'Personal' });
    repo.archive(w.id, true);
    expect(repo.list().map((x) => x.id)).not.toContain(w.id);
    expect(repo.listAll().map((x) => x.id)).toContain(w.id);
  });

  it('update changes only the provided fields and bumps updated_at', async () => {
    const w = repo.create({ name: 'Foo' });
    const before = w.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const updated = repo.update(w.id, { name: 'Bar', color: '#ff0000' });
    expect(updated.name).toBe('Bar');
    expect(updated.color).toBe('#ff0000');
    expect(updated.icon).toBe(w.icon);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('archive toggles the flag', () => {
    const w = repo.create({ name: 'Foo' });
    expect(repo.archive(w.id, true).archived).toBe(true);
    expect(repo.archive(w.id, false).archived).toBe(false);
  });

  it('reorder changes position', () => {
    const w = repo.create({ name: 'Foo' });
    const reordered = repo.reorder(w.id, 'A0');
    expect(reordered.position).toBe('A0');
  });

  it('delete removes the workspace', () => {
    const w = repo.create({ name: 'Foo' });
    repo.delete(w.id);
    expect(repo.getById(w.id)).toBeNull();
  });

  it('delete throws for unknown id', () => {
    expect(() => repo.delete('does-not-exist')).toThrow();
  });
});

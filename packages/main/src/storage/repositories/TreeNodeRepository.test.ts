import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { FolderNode, TabNode } from '@vela/shared';
import { createTestDb } from '../../test/createTestDb';
import { positionsBetween } from '../../lib/tree';
import { TreeNodeRepository } from './TreeNodeRepository';
import { WorkspaceRepository } from './WorkspaceRepository';

const WS = 'default';

describe('TreeNodeRepository', () => {
  let db: DatabaseSync;
  let repo: TreeNodeRepository;

  beforeEach(() => {
    db = createTestDb('profile');
    repo = new TreeNodeRepository(db);
  });

  it('createFolder and createTab persist the discriminated kind', () => {
    const folder = repo.createFolder({ workspaceId: WS, parentId: null, name: 'F' });
    const tab = repo.createTab({
      workspaceId: WS,
      parentId: folder.id,
      url: 'https://example.com',
      originalTitle: 'Example',
    });
    expect(folder.kind).toBe('folder');
    expect(tab.kind).toBe('tab');
    if (tab.kind === 'tab') {
      expect(tab.url).toBe('https://example.com');
      expect(tab.originalTitle).toBe('Example');
    }
  });

  it('rejects pinned tabs that are not at workspace root', () => {
    const folder = repo.createFolder({ workspaceId: WS, parentId: null, name: 'F' });
    expect(() =>
      repo.createTab({
        workspaceId: WS,
        parentId: folder.id,
        url: 'https://example.com',
        pinned: true,
      }),
    ).toThrow();
  });

  it('createFolder requires the parent to be a folder', () => {
    const tab = repo.createTab({
      workspaceId: WS,
      parentId: null,
      url: 'https://example.com',
    });
    expect(() =>
      repo.createFolder({ workspaceId: WS, parentId: tab.id, name: 'Bad' }),
    ).toThrow();
  });

  it('siblings keep order and intermediate inserts land between neighbours', () => {
    const a = repo.createFolder({ workspaceId: WS, parentId: null, name: 'A' });
    const c = repo.createFolder({ workspaceId: WS, parentId: null, name: 'C' });
    const b = repo.createFolder({
      workspaceId: WS,
      parentId: null,
      name: 'B',
      position: positionsBetween(a.position, c.position),
    });
    const ordered = repo
      .getByWorkspace(WS)
      .filter((n) => n.parentId === null)
      .sort((x, y) => (x.position < y.position ? -1 : 1));
    const ids = ordered.map((n) => n.id);
    const ai = ids.indexOf(a.id);
    const bi = ids.indexOf(b.id);
    const ci = ids.indexOf(c.id);
    expect(ai).toBeLessThan(bi);
    expect(bi).toBeLessThan(ci);
  });

  describe('4-level tree', () => {
    let f1: FolderNode;
    let f2: FolderNode;
    let f3: FolderNode;
    let leafTab: TabNode;
    let siblingTab: TabNode;

    beforeEach(() => {
      f1 = repo.createFolder({ workspaceId: WS, parentId: null, name: 'L1' });
      f2 = repo.createFolder({ workspaceId: WS, parentId: f1.id, name: 'L2' });
      f3 = repo.createFolder({ workspaceId: WS, parentId: f2.id, name: 'L3' });
      leafTab = repo.createTab({
        workspaceId: WS,
        parentId: f3.id,
        url: 'https://leaf.example',
        originalTitle: 'leaf',
      });
      siblingTab = repo.createTab({
        workspaceId: WS,
        parentId: f1.id,
        url: 'https://sibling.example',
        originalTitle: 'sibling',
      });
    });

    it('getDescendants returns the full subtree without the node itself', () => {
      const desc = repo.getDescendants(f1.id).map((n) => n.id).sort();
      const expected = [f2.id, f3.id, leafTab.id, siblingTab.id].sort();
      expect(desc).toEqual(expected);
    });

    it('getDescendants of a leaf is empty', () => {
      expect(repo.getDescendants(leafTab.id)).toEqual([]);
    });

    it('getAncestors returns ancestors from immediate parent to root', () => {
      const anc = repo.getAncestors(leafTab.id).map((n) => n.id);
      expect(anc).toEqual([f3.id, f2.id, f1.id]);
    });
  });

  it('move detects cycles and rejects them', () => {
    const f1 = repo.createFolder({ workspaceId: WS, parentId: null, name: 'F1' });
    const f2 = repo.createFolder({ workspaceId: WS, parentId: f1.id, name: 'F2' });
    expect(() => repo.move(f1.id, f2.id, 'm')).toThrow(/cycle/i);
  });

  it('move into self is a cycle', () => {
    const f1 = repo.createFolder({ workspaceId: WS, parentId: null, name: 'F1' });
    expect(() => repo.move(f1.id, f1.id, 'm')).toThrow(/cycle/i);
  });

  it('delete subtree cascades through FK', () => {
    const f1 = repo.createFolder({ workspaceId: WS, parentId: null, name: 'F1' });
    const f2 = repo.createFolder({ workspaceId: WS, parentId: f1.id, name: 'F2' });
    const t = repo.createTab({
      workspaceId: WS,
      parentId: f2.id,
      url: 'https://x.example',
    });
    repo.delete(f1.id, 'subtree');
    expect(repo.getById(f1.id)).toBeNull();
    expect(repo.getById(f2.id)).toBeNull();
    expect(repo.getById(t.id)).toBeNull();
  });

  it('delete promote-children moves children up and recomputes positions', () => {
    const grand = repo.createFolder({ workspaceId: WS, parentId: null, name: 'G' });
    const mid = repo.createFolder({
      workspaceId: WS,
      parentId: grand.id,
      name: 'M',
    });
    const c1 = repo.createTab({
      workspaceId: WS,
      parentId: mid.id,
      url: 'https://c1.example',
    });
    const c2 = repo.createTab({
      workspaceId: WS,
      parentId: mid.id,
      url: 'https://c2.example',
    });
    // sibling of `mid` so we have a "next" position to land between
    const after = repo.createFolder({
      workspaceId: WS,
      parentId: grand.id,
      name: 'After',
    });

    repo.delete(mid.id, 'promote-children');

    expect(repo.getById(mid.id)).toBeNull();

    const c1After = repo.getById(c1.id);
    const c2After = repo.getById(c2.id);
    expect(c1After?.parentId).toBe(grand.id);
    expect(c2After?.parentId).toBe(grand.id);

    // c1 should still come before c2 (preserves order)
    if (c1After && c2After) {
      expect(c1After.position < c2After.position).toBe(true);
    }
    // both should land before `after` (the sibling that came after `mid`)
    const afterAfter = repo.getById(after.id);
    if (afterAfter && c1After && c2After) {
      expect(c1After.position < afterAfter.position).toBe(true);
      expect(c2After.position < afterAfter.position).toBe(true);
    }
  });

  it('delete promote-children only valid for folders', () => {
    const t = repo.createTab({
      workspaceId: WS,
      parentId: null,
      url: 'https://x.example',
    });
    expect(() => repo.delete(t.id, 'promote-children')).toThrow();
  });

  it('moving a pinned tab into a folder auto-deactivates pinned', () => {
    const folder = repo.createFolder({ workspaceId: WS, parentId: null, name: 'F' });
    const pinned = repo.createTab({
      workspaceId: WS,
      parentId: null,
      url: 'https://pin.example',
      pinned: true,
    });
    expect(pinned.pinned).toBe(true);
    const result = repo.move(pinned.id, folder.id, 'm');
    expect(result.pinnedDeactivated).toBe(true);
    expect(result.node.kind).toBe('tab');
    if (result.node.kind === 'tab') {
      expect(result.node.pinned).toBe(false);
      expect(result.node.parentId).toBe(folder.id);
    }
  });

  it('moving a non-pinned tab does not flip the pinnedDeactivated flag', () => {
    const folder = repo.createFolder({ workspaceId: WS, parentId: null, name: 'F' });
    const tab = repo.createTab({
      workspaceId: WS,
      parentId: null,
      url: 'https://x.example',
    });
    const result = repo.move(tab.id, folder.id, 'm');
    expect(result.pinnedDeactivated).toBe(false);
  });

  it('reorder changes only the position', () => {
    const a = repo.createFolder({ workspaceId: WS, parentId: null, name: 'A' });
    const updated = repo.reorder(a.id, 'Z9');
    expect(updated.position).toBe('Z9');
    expect(updated.parentId).toBe(a.parentId);
  });

  it('toggleCollapse flips collapsed on a folder and rejects tabs', () => {
    const f = repo.createFolder({ workspaceId: WS, parentId: null, name: 'F' });
    expect(f.collapsed).toBe(false);
    const after = repo.toggleCollapse(f.id);
    expect(after.collapsed).toBe(true);
    const after2 = repo.toggleCollapse(f.id);
    expect(after2.collapsed).toBe(false);

    const t = repo.createTab({
      workspaceId: WS,
      parentId: null,
      url: 'https://x.example',
    });
    expect(() => repo.toggleCollapse(t.id)).toThrow();
  });

  it('update rejects tab-only fields on folders and folder-only fields on tabs', () => {
    const f = repo.createFolder({ workspaceId: WS, parentId: null, name: 'F' });
    expect(() => repo.update(f.id, { url: 'https://x.example' })).toThrow();

    const t = repo.createTab({
      workspaceId: WS,
      parentId: null,
      url: 'https://x.example',
    });
    expect(() => repo.update(t.id, { collapsed: true })).toThrow();

    // Las pestañas-carpeta sí se pliegan, como en toggleCollapse.
    const folderTab = repo.createTab({
      workspaceId: WS,
      parentId: null,
      url: 'vela://folder-view?id=x',
    });
    expect(repo.update(folderTab.id, { collapsed: true }).collapsed).toBe(true);
  });

  describe('searchTabs', () => {
    it('matches case-insensitive in url and title across workspaces', () => {
      const wsRepo = new WorkspaceRepository(db);
      const other = wsRepo.create({ name: 'Trabajo' });

      const a = repo.createTab({
        workspaceId: WS,
        parentId: null,
        url: 'https://github.com/foo',
        originalTitle: 'GitHub - Foo',
        lastActiveAt: 100,
      });
      const b = repo.createTab({
        workspaceId: other.id,
        parentId: null,
        url: 'https://example.com',
        originalTitle: 'Probando GitHub Actions',
        lastActiveAt: 200,
      });
      // No matchea: ni url ni título contienen 'github'.
      repo.createTab({
        workspaceId: WS,
        parentId: null,
        url: 'https://google.com',
        originalTitle: 'Google',
        lastActiveAt: 300,
      });

      const results = repo.searchTabs('GITHUB', 10);
      const ids = results.map((r) => r.tab.id).sort();
      expect(ids).toEqual([a.id, b.id].sort());
      // workspaceName se devuelve junto con cada tab
      const workspaces = new Set(results.map((r) => r.workspaceName));
      expect(workspaces.has('Default')).toBe(true);
      expect(workspaces.has('Trabajo')).toBe(true);
    });

    it('orders by last_active_at desc with NULLs last and respects limit', () => {
      const t1 = repo.createTab({
        workspaceId: WS,
        parentId: null,
        url: 'https://example.com/one',
        originalTitle: 'one',
        lastActiveAt: 100,
      });
      const t2 = repo.createTab({
        workspaceId: WS,
        parentId: null,
        url: 'https://example.com/two',
        originalTitle: 'two',
        lastActiveAt: 300,
      });
      const t3 = repo.createTab({
        workspaceId: WS,
        parentId: null,
        url: 'https://example.com/three',
        originalTitle: 'three',
        lastActiveAt: null,
      });

      const all = repo.searchTabs('example.com', 10);
      expect(all.map((r) => r.tab.id)).toEqual([t2.id, t1.id, t3.id]);

      const limited = repo.searchTabs('example.com', 2);
      expect(limited.map((r) => r.tab.id)).toEqual([t2.id, t1.id]);
    });

    it('prefers custom name over original title when matching', () => {
      const t = repo.createTab({
        workspaceId: WS,
        parentId: null,
        url: 'https://example.com',
        originalTitle: 'Boring Original Title',
        name: 'Banco',
      });
      // El custom name ('Banco') matchea aunque originalTitle no lo contenga.
      expect(repo.searchTabs('banco', 5).map((r) => r.tab.id)).toEqual([t.id]);
      // Y el originalTitle no se usa cuando custom name está presente.
      expect(repo.searchTabs('boring', 5)).toEqual([]);
    });

    it('returns empty for empty query or non-positive limit', () => {
      repo.createTab({
        workspaceId: WS,
        parentId: null,
        url: 'https://example.com',
        originalTitle: 'x',
      });
      expect(repo.searchTabs('', 10)).toEqual([]);
      expect(repo.searchTabs('x', 0)).toEqual([]);
    });

    it('does not include folders even if their name matches', () => {
      repo.createFolder({ workspaceId: WS, parentId: null, name: 'github' });
      expect(repo.searchTabs('github', 10)).toEqual([]);
    });
  });

  describe('operaciones en bloque', () => {
    const tab = (parentId: string | null, name: string, ws = WS): TabNode =>
      repo.createTab({
        workspaceId: ws,
        parentId,
        url: `https://${name}.example.com`,
        originalTitle: name,
      });

    const childrenOf = (parentId: string | null, ws = WS): string[] =>
      repo
        .getByWorkspace(ws)
        .filter((n) => n.parentId === parentId)
        .sort((a, b) => (a.position < b.position ? -1 : 1))
        .map((n) => n.id);

    it('moveMany mete varias pestañas en una carpeta conservando el orden dado', () => {
      const folder = repo.createFolder({ workspaceId: WS, parentId: null, name: 'F' });
      const a = tab(null, 'a');
      const b = tab(null, 'b');
      const c = tab(null, 'c');
      const result = repo.moveMany([c.id, a.id], folder.id);
      expect(result.nodes.map((n) => n.parentId)).toEqual([folder.id, folder.id]);
      expect(childrenOf(folder.id)).toEqual([c.id, a.id]);
      expect(childrenOf(null)).toEqual([folder.id, b.id]);
      expect(result.affectedWorkspaceIds).toEqual([WS]);
    });

    it('moveMany coloca los nodos dentro del hueco indicado', () => {
      const a = tab(null, 'a');
      const b = tab(null, 'b');
      const c = tab(null, 'c');
      const d = tab(null, 'd');
      // Mover d y c entre a y b.
      repo.moveMany([d.id, c.id], null, { prev: a.position, next: b.position });
      expect(childrenOf(null)).toEqual([a.id, d.id, c.id, b.id]);
    });

    it('moveMany a otro workspace arrastra los descendientes', () => {
      const wsRepo = new WorkspaceRepository(db);
      const other = wsRepo.create({ name: 'Otro' });
      const existing = tab(null, 'existente', other.id);
      const folderTab = repo.createFolderTab({ workspaceId: WS, parentId: null, name: 'FT' });
      const child = tab(folderTab.id, 'hija');
      const loose = tab(null, 'suelta');

      const result = repo.moveMany([folderTab.id, loose.id], null, undefined, other.id);
      expect(new Set(result.affectedWorkspaceIds)).toEqual(new Set([WS, other.id]));
      expect(childrenOf(null, other.id)).toEqual([existing.id, folderTab.id, loose.id]);
      expect(repo.getById(child.id)?.workspaceId).toBe(other.id);
      expect(repo.getById(child.id)?.parentId).toBe(folderTab.id);
    });

    it('moveMany ignora los nodos que ya viajan dentro de otro de la lista', () => {
      const target = repo.createFolder({ workspaceId: WS, parentId: null, name: 'T' });
      const folderTab = repo.createFolderTab({ workspaceId: WS, parentId: null, name: 'FT' });
      const child = tab(folderTab.id, 'hija');
      const result = repo.moveMany([folderTab.id, child.id], target.id);
      expect(result.nodes.map((n) => n.id)).toEqual([folderTab.id]);
      expect(repo.getById(child.id)?.parentId).toBe(folderTab.id);
    });

    it('moveMany rechaza ciclos sin mover nada', () => {
      const folder = repo.createFolder({ workspaceId: WS, parentId: null, name: 'F' });
      const sub = repo.createFolder({ workspaceId: WS, parentId: folder.id, name: 'S' });
      const a = tab(null, 'a');
      expect(() => repo.moveMany([a.id, folder.id], sub.id)).toThrow();
      expect(repo.getById(a.id)?.parentId).toBeNull();
    });

    it('moveMany rechaza un hueco invertido', () => {
      const a = tab(null, 'a');
      const b = tab(null, 'b');
      const c = tab(null, 'c');
      expect(() =>
        repo.moveMany([c.id], null, { prev: b.position, next: a.position }),
      ).toThrow();
    });

    it('moveMany desestiba las Cargas que entran en una carpeta', () => {
      const folder = repo.createFolder({ workspaceId: WS, parentId: null, name: 'F' });
      const pinned = repo.createTab({
        workspaceId: WS,
        parentId: null,
        url: 'https://pinned.example.com',
        pinned: true,
      });
      repo.moveMany([pinned.id], folder.id);
      const after = repo.getById(pinned.id);
      expect(after?.kind === 'tab' && after.pinned).toBe(false);
    });

    it('groupIntoFolder crea la carpeta en el sitio de la primera pestaña', () => {
      const a = tab(null, 'a');
      const b = tab(null, 'b');
      const c = tab(null, 'c');
      const d = tab(null, 'd');
      const { folder, nodes } = repo.groupIntoFolder([b.id, d.id], 'Grupo');
      expect(folder.name).toBe('Grupo');
      expect(folder.url.startsWith('vela://folder-view')).toBe(true);
      expect(nodes.map((n) => n.parentId)).toEqual([folder.id, folder.id]);
      expect(childrenOf(null)).toEqual([a.id, folder.id, c.id]);
      expect(childrenOf(folder.id)).toEqual([b.id, d.id]);
    });

    it('groupIntoFolder rechaza pestañas de workspaces distintos', () => {
      const wsRepo = new WorkspaceRepository(db);
      const other = wsRepo.create({ name: 'Otro' });
      const a = tab(null, 'a');
      const b = tab(null, 'b', other.id);
      expect(() => repo.groupIntoFolder([a.id, b.id], 'X')).toThrow();
      expect(repo.getByWorkspace(WS).filter((n) => n.kind === 'folder')).toEqual([]);
    });

    it('deleteMany borra varias pestañas e ignora las que no existen', () => {
      const a = tab(null, 'a');
      const b = tab(null, 'b');
      const c = tab(null, 'c');
      expect(repo.deleteMany([a.id, 'no-existe', c.id, a.id])).toEqual([a.id, c.id]);
      expect(childrenOf(null)).toEqual([b.id]);
    });
  });
});

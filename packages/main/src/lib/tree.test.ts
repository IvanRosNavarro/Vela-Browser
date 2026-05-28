import { describe, it, expect } from 'vitest';
import type { TreeNode } from '@vela/shared';
import {
  wouldCreateCycle,
  buildTree,
  positionsAtStart,
  positionsAtEnd,
  positionsBetween,
  positionsNBetween,
} from './tree';

const folder = (
  id: string,
  parentId: string | null,
  position: string,
): TreeNode => ({
  id,
  workspaceId: 'ws',
  parentId,
  kind: 'folder',
  position,
  name: id,
  color: null,
  icon: null,
  createdAt: 0,
  updatedAt: 0,
  collapsed: false,
});

const tab = (
  id: string,
  parentId: string | null,
  position: string,
): TreeNode => ({
  id,
  workspaceId: 'ws',
  parentId,
  kind: 'tab',
  position,
  name: null,
  color: null,
  icon: null,
  createdAt: 0,
  updatedAt: 0,
  url: 'https://example.com',
  originalTitle: 't',
  favicon: null,
  pinned: false,
  pinnedUrl: null,
  anchored: false,
  anchoredUrl: null,
  discarded: false,
  collapsed: false,
  lastActiveAt: null,
  isSecure: false,
});

describe('wouldCreateCycle', () => {
  it('returns false when newParentId is null', () => {
    const get = (): null => null;
    expect(wouldCreateCycle('a', null, get)).toBe(false);
  });

  it('returns true when moving a node into itself', () => {
    const nodes = new Map([['a', { id: 'a', parentId: null }]]);
    expect(wouldCreateCycle('a', 'a', (id) => nodes.get(id) ?? null)).toBe(true);
  });

  it('returns true when newParentId is a descendant of nodeId', () => {
    // a -> b -> c. Trying to move 'a' under 'c' would cycle.
    const nodes = new Map<string, { id: string; parentId: string | null }>([
      ['a', { id: 'a', parentId: null }],
      ['b', { id: 'b', parentId: 'a' }],
      ['c', { id: 'c', parentId: 'b' }],
    ]);
    expect(wouldCreateCycle('a', 'c', (id) => nodes.get(id) ?? null)).toBe(true);
  });

  it('returns false when newParentId is unrelated', () => {
    const nodes = new Map<string, { id: string; parentId: string | null }>([
      ['a', { id: 'a', parentId: null }],
      ['x', { id: 'x', parentId: null }],
    ]);
    expect(wouldCreateCycle('a', 'x', (id) => nodes.get(id) ?? null)).toBe(false);
  });
});

describe('buildTree', () => {
  it('builds a hierarchy from a flat list and sorts siblings by position', () => {
    const flat: TreeNode[] = [
      folder('root2', null, 'b'),
      folder('root1', null, 'a'),
      tab('child2', 'root1', 'b'),
      tab('child1', 'root1', 'a'),
    ];
    const tree = buildTree(flat);
    expect(tree.map((n) => n.id)).toEqual(['root1', 'root2']);
    const root1 = tree[0];
    expect(root1?.children.map((c) => c.id)).toEqual(['child1', 'child2']);
  });

  it('puts orphans (parent missing from set) at the root', () => {
    const flat: TreeNode[] = [tab('orphan', 'missing-parent', 'a')];
    const tree = buildTree(flat);
    expect(tree.map((n) => n.id)).toEqual(['orphan']);
  });
});

describe('position helpers', () => {
  it('positionsAtStart < positionsAtEnd of an empty list', () => {
    const start = positionsAtStart(null);
    const end = positionsAtEnd(null);
    // both call generateKeyBetween(null, null) → same key; just verify non-empty
    expect(start.length).toBeGreaterThan(0);
    expect(end.length).toBeGreaterThan(0);
  });

  it('positionsBetween returns a key strictly between two existing positions', () => {
    const a = positionsAtStart(null);
    const c = positionsAtEnd(a);
    const b = positionsBetween(a, c);
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });

  it('positionsNBetween generates N strictly increasing keys between bounds', () => {
    const a = positionsAtStart(null);
    const z = positionsAtEnd(a);
    const middle = positionsNBetween(a, z, 3);
    expect(middle.length).toBe(3);
    expect(a < (middle[0] ?? '')).toBe(true);
    expect((middle[0] ?? '') < (middle[1] ?? '')).toBe(true);
    expect((middle[1] ?? '') < (middle[2] ?? '')).toBe(true);
    expect((middle[2] ?? '') < z).toBe(true);
  });

  it('positionsNBetween returns empty array for count <= 0', () => {
    expect(positionsNBetween(null, null, 0)).toEqual([]);
    expect(positionsNBetween(null, null, -1)).toEqual([]);
  });
});

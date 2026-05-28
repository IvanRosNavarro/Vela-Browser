import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import type { TreeNode } from '@vela/shared';

export type GetNodeFn = (id: string) => Pick<TreeNode, 'id' | 'parentId'> | null;

export function wouldCreateCycle(
  nodeId: string,
  newParentId: string | null,
  getNode: GetNodeFn,
): boolean {
  if (newParentId === null) return false;
  if (newParentId === nodeId) return true;

  let cursor: string | null = newParentId;
  const seen = new Set<string>();
  while (cursor !== null) {
    if (cursor === nodeId) return true;
    if (seen.has(cursor)) {
      // cadena ya rota; tratar como ciclo para evitar bucle infinito
      return true;
    }
    seen.add(cursor);
    const parent = getNode(cursor);
    if (!parent) return false;
    cursor = parent.parentId;
  }
  return false;
}

export interface TreeNodeWithChildren extends Omit<TreeNode, never> {
  children: TreeNodeWithChildren[];
}

export function buildTree(flatNodes: readonly TreeNode[]): TreeNodeWithChildren[] {
  const map = new Map<string, TreeNodeWithChildren>();
  for (const node of flatNodes) {
    map.set(node.id, { ...(node as TreeNode), children: [] } as TreeNodeWithChildren);
  }
  const roots: TreeNodeWithChildren[] = [];
  for (const node of flatNodes) {
    const enriched = map.get(node.id);
    if (!enriched) continue;
    if (node.parentId === null) {
      roots.push(enriched);
      continue;
    }
    const parent = map.get(node.parentId);
    if (parent) {
      parent.children.push(enriched);
    } else {
      // padre fuera del set: lo tratamos como huérfano de raíz
      roots.push(enriched);
    }
  }
  const sortByPosition = (a: TreeNodeWithChildren, b: TreeNodeWithChildren): number =>
    a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
  roots.sort(sortByPosition);
  for (const node of map.values()) {
    node.children.sort(sortByPosition);
  }
  return roots;
}

export function positionsAtStart(firstSibling: string | null | undefined): string {
  return generateKeyBetween(null, firstSibling ?? null);
}

export function positionsAtEnd(lastSibling: string | null | undefined): string {
  return generateKeyBetween(lastSibling ?? null, null);
}

export function positionsBetween(
  prev: string | null | undefined,
  next: string | null | undefined,
): string {
  return generateKeyBetween(prev ?? null, next ?? null);
}

export function positionsNBetween(
  prev: string | null | undefined,
  next: string | null | undefined,
  count: number,
): string[] {
  if (count <= 0) return [];
  return generateNKeysBetween(prev ?? null, next ?? null, count);
}

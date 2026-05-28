import { generateKeyBetween } from 'fractional-indexing';
import type { TreeNode } from '@vela/shared';
import { isFolderLike } from '@vela/shared';
import type { TabNode } from '@vela/shared';
import { PINNED_TARGET_ID, ANCHOR_TARGET_ID, type DropZone } from './dropValidation';

export interface DropResolution {
  newParentId: string | null;
  newPosition: string;
}

function siblingsAt(
  nodes: TreeNode[],
  parentId: string | null,
  excludeId: string,
): TreeNode[] {
  return nodes
    .filter((n) => n.parentId === parentId && n.id !== excludeId)
    .sort((a, b) =>
      a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
    );
}

export function resolveDropPosition(
  draggedId: string,
  target: { nodeId: string; parentId: string | null; zone: DropZone },
  nodes: TreeNode[],
): DropResolution | null {
  if (target.nodeId === PINNED_TARGET_ID) {
    const pinned = nodes
      .filter(
        (n) =>
          n.kind === 'tab' &&
          n.pinned &&
          n.parentId === null &&
          n.id !== draggedId,
      )
      .sort((a, b) =>
        a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
      );
    const last = pinned[pinned.length - 1] ?? null;
    return {
      newParentId: null,
      newPosition: generateKeyBetween(last?.position ?? null, null),
    };
  }

  if (target.nodeId === ANCHOR_TARGET_ID) {
    const anchored = nodes
      .filter(
        (n) =>
          n.kind === 'tab' &&
          (n as TabNode).anchored &&
          n.parentId === null &&
          n.id !== draggedId,
      )
      .sort((a, b) =>
        a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
      );
    const last = anchored[anchored.length - 1] ?? null;
    return {
      newParentId: null,
      newPosition: generateKeyBetween(last?.position ?? null, null),
    };
  }

  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const targetNode = byId.get(target.nodeId);
  if (!targetNode) return null;

  if (target.zone === 'inside') {
    if (!isFolderLike(targetNode)) return null;
    const children = siblingsAt(nodes, targetNode.id, draggedId);
    const last = children[children.length - 1] ?? null;
    const newPosition = generateKeyBetween(last?.position ?? null, null);
    return { newParentId: targetNode.id, newPosition };
  }

  const newParentId = targetNode.parentId;
  const siblings = siblingsAt(nodes, newParentId, draggedId);
  const targetIndex = siblings.findIndex((n) => n.id === targetNode.id);
  if (targetIndex === -1) {
    const last = siblings[siblings.length - 1] ?? null;
    return {
      newParentId,
      newPosition: generateKeyBetween(last?.position ?? null, null),
    };
  }

  const targetSibling = siblings[targetIndex]!;

  if (target.zone === 'before') {
    const prev = siblings[targetIndex - 1] ?? null;
    return {
      newParentId,
      newPosition: generateKeyBetween(
        prev?.position ?? null,
        targetSibling.position,
      ),
    };
  }

  const next = siblings[targetIndex + 1] ?? null;
  return {
    newParentId,
    newPosition: generateKeyBetween(
      targetSibling.position,
      next?.position ?? null,
    ),
  };
}

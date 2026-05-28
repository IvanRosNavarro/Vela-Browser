import type { TreeNode, TabNode } from '@vela/shared';
import { isFolderLike } from '@vela/shared';

export type DropZone = 'before' | 'after' | 'inside';

export const PINNED_TARGET_ID = '__vela:pinned-section__';
export const ANCHOR_TARGET_ID = '__vela:anchor-section__';

export interface DroppableId {
  nodeId: string;
  zone: DropZone;
}

export function encodeDroppableId(nodeId: string, zone: DropZone): string {
  return `${nodeId}::${zone}`;
}

export function decodeDroppableId(raw: string): DroppableId | null {
  const idx = raw.lastIndexOf('::');
  if (idx === -1) return null;
  const nodeId = raw.slice(0, idx);
  const zone = raw.slice(idx + 2) as DropZone;
  if (zone !== 'before' && zone !== 'after' && zone !== 'inside') return null;
  return { nodeId, zone };
}

export function isDescendant(
  ancestorId: string,
  candidateId: string,
  byId: Map<string, TreeNode>,
): boolean {
  let current = byId.get(candidateId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = byId.get(current.parentId);
  }
  return false;
}

export function isDropValid(
  draggedId: string,
  target: { parentId: string | null; nodeId: string; zone: DropZone },
  byId: Map<string, TreeNode>,
): boolean {
  const dragged = byId.get(draggedId);
  if (!dragged) return false;

  if (target.nodeId === PINNED_TARGET_ID) {
    return dragged.kind === 'tab';
  }

  if (target.nodeId === ANCHOR_TARGET_ID) {
    return dragged.kind === 'tab' && !(dragged as TabNode).anchored;
  }

  if (target.nodeId === draggedId) return false;

  if (target.zone === 'inside') {
    const targetNode = byId.get(target.nodeId);
    if (!targetNode || !isFolderLike(targetNode)) return false;
    if (target.nodeId === draggedId) return false;
    if (isDescendant(draggedId, target.nodeId, byId)) return false;
    return true;
  }

  const newParentId = target.parentId;
  if (newParentId === null) return true;
  if (newParentId === draggedId) return false;
  if (isDescendant(draggedId, newParentId, byId)) return false;
  return true;
}

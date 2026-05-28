import { useDroppable } from '@dnd-kit/core';
import type { TreeNode } from '@vela/shared';
import { isFolderLike } from '@vela/shared';
import { encodeDroppableId, type DropZone } from './dropValidation';

export interface NodeDropData {
  nodeId: string;
  parentId: string | null;
  workspaceId: string;
  kind: TreeNode['kind'];
  zone: DropZone;
}

export interface NodeDroppables {
  before: ReturnType<typeof useDroppable>;
  after: ReturnType<typeof useDroppable>;
  inside: ReturnType<typeof useDroppable> | null;
}

export function useNodeDrop(node: TreeNode): NodeDroppables {
  const before = useDroppable({
    id: encodeDroppableId(node.id, 'before'),
    data: {
      nodeId: node.id,
      parentId: node.parentId,
      workspaceId: node.workspaceId,
      kind: node.kind,
      zone: 'before',
    } satisfies NodeDropData,
  });

  const after = useDroppable({
    id: encodeDroppableId(node.id, 'after'),
    data: {
      nodeId: node.id,
      parentId: node.parentId,
      workspaceId: node.workspaceId,
      kind: node.kind,
      zone: 'after',
    } satisfies NodeDropData,
  });

  const inside = useDroppable({
    id: encodeDroppableId(node.id, 'inside'),
    disabled: !isFolderLike(node),
    data: {
      nodeId: node.id,
      parentId: node.parentId,
      workspaceId: node.workspaceId,
      kind: node.kind,
      zone: 'inside',
    } satisfies NodeDropData,
  });

  return {
    before,
    after,
    inside: isFolderLike(node) ? inside : null,
  };
}

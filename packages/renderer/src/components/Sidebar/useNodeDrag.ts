import { useDraggable } from '@dnd-kit/core';
import type { TreeNode } from '@vela/shared';

export interface NodeDragData {
  kind: TreeNode['kind'];
  parentId: string | null;
  workspaceId: string;
}

export function useNodeDrag(node: TreeNode) {
  return useDraggable({
    id: node.id,
    data: {
      kind: node.kind,
      parentId: node.parentId,
      workspaceId: node.workspaceId,
    } satisfies NodeDragData,
  });
}

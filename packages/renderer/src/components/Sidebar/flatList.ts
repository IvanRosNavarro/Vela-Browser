import type { TabNode, TreeNode } from '@vela/shared';
import { isFolderLike } from '@vela/shared';
import {
  selectChildrenByParent,
  type TreeState,
} from '../../stores/treeStore';

export interface FlatNode {
  node: TreeNode;
  depth: number;
}

export function selectVisibleFlatListWithDepth(
  state: TreeState,
  workspaceId: string,
  options?: { includePinned?: boolean },
): FlatNode[] {
  const includePinned = options?.includePinned ?? false;
  const childrenMap = selectChildrenByParent(state, workspaceId);
  const out: FlatNode[] = [];

  const walk = (parentId: string | null, depth: number): void => {
    const children = childrenMap.get(parentId);
    if (!children) return;
    for (const child of children) {
      if (
        !includePinned &&
        depth === 0 &&
        child.kind === 'tab' &&
        (child.pinned || child.anchored)
      ) {
        continue;
      }
      out.push({ node: child, depth });
      if (isFolderLike(child) && !child.collapsed) {
        walk(child.id, depth + 1);
      }
    }
  };
  walk(null, 0);
  return out;
}

export function selectPinnedTabs(
  state: TreeState,
  workspaceId: string,
): TreeNode[] {
  const nodes = state.nodesByWorkspace[workspaceId] ?? [];
  return nodes
    .filter((n) => n.parentId === null && n.kind === 'tab' && n.pinned)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
}

export function buildIdToFlat(flat: FlatNode[]): Map<string, FlatNode> {
  const map = new Map<string, FlatNode>();
  for (const item of flat) map.set(item.node.id, item);
  return map;
}

export function selectAnchoredTabs(state: TreeState): TabNode[] {
  return state.anchoredTabs;
}

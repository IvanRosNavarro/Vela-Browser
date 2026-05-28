import { create } from 'zustand';
import type {
  FolderTabCreateInput,
  NodeDeleteInput,
  NodeMoveInput,
  NodeRenameInput,
  NodeReorderInput,
  NodeUpdateInput,
  TabCreateInput,
  TabNode,
  TreeNode,
} from '@vela/shared';
import { isFolderLike } from '@vela/shared';
import { call } from '../lib/ipc';

export interface TreeState {
  nodesByWorkspace: Record<string, TreeNode[]>;
  loadedWorkspaces: Set<string>;
  anchoredTabs: TabNode[];

  hydrateWorkspace: (workspaceId: string) => Promise<void>;
  invalidate: (workspaceId: string) => Promise<void>;
  hydrateAnchored: () => Promise<void>;
  setAnchoredTabs: (tabs: TabNode[]) => void;

  createFolder: (input: FolderTabCreateInput) => Promise<TabNode>;
  createTab: (input: TabCreateInput) => Promise<TabNode>;
  updateNode: (input: NodeUpdateInput) => Promise<TreeNode>;
  deleteNode: (input: NodeDeleteInput) => Promise<void>;
  moveNode: (input: NodeMoveInput) => Promise<TreeNode>;
  reorderNode: (input: NodeReorderInput) => Promise<TreeNode>;
  toggleCollapse: (id: string, collapsed?: boolean) => Promise<TreeNode>;
  renameNode: (input: NodeRenameInput) => Promise<TreeNode>;
}

async function fetchTree(workspaceId: string): Promise<TreeNode[]> {
  return call(() => window.api.tree.getByWorkspace({ workspaceId }));
}

export const useTreeStore = create<TreeState>((set, get) => ({
  nodesByWorkspace: {},
  loadedWorkspaces: new Set<string>(),
  anchoredTabs: [],

  async hydrateWorkspace(workspaceId) {
    const nodes = await fetchTree(workspaceId);
    set((state) => {
      const next = new Set(state.loadedWorkspaces);
      next.add(workspaceId);
      return {
        nodesByWorkspace: {
          ...state.nodesByWorkspace,
          [workspaceId]: nodes,
        },
        loadedWorkspaces: next,
      };
    });
  },

  async invalidate(workspaceId) {
    if (!get().loadedWorkspaces.has(workspaceId)) return;
    const nodes = await fetchTree(workspaceId);
    set((state) => {
      const anchoredFromThisWs = nodes.filter(
        (n): n is TabNode => n.kind === 'tab' && (n as TabNode).anchored,
      );
      const anchoredFromOtherWs = state.anchoredTabs.filter(
        (t) => t.workspaceId !== workspaceId,
      );
      return {
        nodesByWorkspace: {
          ...state.nodesByWorkspace,
          [workspaceId]: nodes,
        },
        anchoredTabs: [...anchoredFromOtherWs, ...anchoredFromThisWs],
      };
    });
  },

  async hydrateAnchored() {
    const tabs = await call(() => window.api.tab.listAnchored());
    set({ anchoredTabs: tabs });
  },

  setAnchoredTabs(tabs) {
    set({ anchoredTabs: tabs });
  },

  async createFolder(input) {
    return call(() => window.api.node.createFolderTab(input));
  },

  async createTab(input) {
    const tab = await call(() => window.api.node.createTab(input));
    return tab;
  },

  async updateNode(input) {
    return call(() => window.api.node.update(input));
  },

  async deleteNode(input) {
    await call(() => window.api.node.delete(input));
  },

  async moveNode(input) {
    return call(() => window.api.node.move(input));
  },

  async reorderNode(input) {
    return call(() => window.api.node.reorder(input));
  },

  async toggleCollapse(id, collapsed) {
    let newCollapsed: boolean;
    let workspaceId: string | undefined;
    if (collapsed !== undefined) {
      newCollapsed = collapsed;
    } else {
      let found = false;
      for (const [wsId, nodes] of Object.entries(get().nodesByWorkspace)) {
        const node = nodes.find((n) => n.id === id);
        if (node !== undefined) {
          newCollapsed = !node.collapsed;
          workspaceId = wsId;
          found = true;
          break;
        }
      }
      if (!found) newCollapsed = false;
    }
    // Update local state immediately so the UI responds without waiting for IPC round-trip
    set((state) => ({
      nodesByWorkspace: Object.fromEntries(
        Object.entries(state.nodesByWorkspace).map(([wsId, nodes]) => [
          wsId,
          nodes.map((n) => n.id === id ? { ...n, collapsed: newCollapsed! } : n),
        ]),
      ),
    }));
    // Persist to DB and sync
    try {
      await call(() => window.api.node.toggleCollapse({ id, collapsed: newCollapsed! }));
    } catch {
      // On failure revert by re-fetching
      if (workspaceId) void get().invalidate(workspaceId);
    }
    return get().nodesByWorkspace[workspaceId ?? '']?.find((n) => n.id === id) as TreeNode;
  },

  async renameNode(input) {
    return call(() => window.api.node.rename(input));
  },
}));

// ---------- selectores ----------

export function selectChildrenByParent(
  state: TreeState,
  workspaceId: string,
): Map<string | null, TreeNode[]> {
  const nodes = state.nodesByWorkspace[workspaceId] ?? [];
  const map = new Map<string | null, TreeNode[]>();
  for (const node of nodes) {
    const bucket = map.get(node.parentId);
    if (bucket) {
      bucket.push(node);
    } else {
      map.set(node.parentId, [node]);
    }
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  }
  return map;
}

export function selectNodeById(
  state: TreeState,
  workspaceId: string,
  id: string,
): TreeNode | undefined {
  const nodes = state.nodesByWorkspace[workspaceId];
  if (!nodes) return undefined;
  return nodes.find((n) => n.id === id);
}

export function selectVisibleFlatList(
  state: TreeState,
  workspaceId: string,
): TreeNode[] {
  const childrenMap = selectChildrenByParent(state, workspaceId);
  const out: TreeNode[] = [];
  const walk = (parentId: string | null): void => {
    const children = childrenMap.get(parentId);
    if (!children) return;
    for (const child of children) {
      out.push(child);
      if (isFolderLike(child) && !child.collapsed) {
        walk(child.id);
      }
    }
  };
  walk(null);
  return out;
}

export function selectAncestors(
  state: TreeState,
  workspaceId: string,
  id: string,
): TreeNode[] {
  const nodes = state.nodesByWorkspace[workspaceId];
  if (!nodes) return [];
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const out: TreeNode[] = [];
  let current = byId.get(id);
  while (current?.parentId) {
    const parent = byId.get(current.parentId);
    if (!parent) break;
    out.push(parent);
    current = parent;
  }
  return out;
}

export function selectDescendantCount(
  state: TreeState,
  workspaceId: string,
  id: string,
): number {
  const childrenMap = selectChildrenByParent(state, workspaceId);
  let count = 0;
  const walk = (parentId: string): void => {
    const children = childrenMap.get(parentId);
    if (!children) return;
    for (const child of children) {
      count += 1;
      if (isFolderLike(child)) walk(child.id);
    }
  };
  walk(id);
  return count;
}

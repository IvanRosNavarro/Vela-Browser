export type TreeNodeKind = 'folder' | 'tab';

export interface TreeNodeBase {
  id: string;
  workspaceId: string;
  parentId: string | null;
  kind: TreeNodeKind;
  position: string;
  name: string | null;
  color: string | null;
  icon: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface FolderNode extends TreeNodeBase {
  kind: 'folder';
  collapsed: boolean;
}

export interface TabNode extends TreeNodeBase {
  kind: 'tab';
  collapsed: boolean;
  url: string;
  originalTitle: string;
  favicon: string | null;
  pinned: boolean;
  /** URL con la que se ancló como Carga. Nulo si no está anclado o si fue anclado antes de la migración 010. */
  pinnedUrl: string | null;
  anchored: boolean;
  /** URL con la que se ancló como Ancla. Nulo si no está anclado. */
  anchoredUrl: string | null;
  discarded: boolean;
  lastActiveAt: number | null;
  isSecure: boolean;
}

export type TreeNode = FolderNode | TabNode;

export function isFolderTab(node: TreeNode): node is TabNode {
  return node.kind === 'tab' && node.url.startsWith('vela://folder-view');
}

export function isFolderLike(node: TreeNode): boolean {
  return node.kind === 'folder' || isFolderTab(node);
}

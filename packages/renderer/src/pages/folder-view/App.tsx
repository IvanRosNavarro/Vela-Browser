import { useCallback, useEffect, useMemo, useState } from 'react';
import { IPC_EVENTS, isFolderLike } from '@vela/shared';
import type { TabNode, TreeNode } from '@vela/shared';
import { themeManager } from '../../shared-ui/theme';
import { Toaster } from '../../components/Toaster';
import { toast } from '../../stores/toastStore';
import {
  CollectionView,
  ConfirmDialog,
  useViewModeSetting,
  type BreadcrumbEntry,
  type CollectionEditResult,
  type CollectionItem,
} from '../../shared-ui/collection-view';

function deriveTabTitle(node: TabNode): string {
  if (node.name?.trim()) return node.name;
  if (node.originalTitle?.trim()) return node.originalTitle;
  try { return new URL(node.url).hostname; } catch { return node.url; }
}

function byPosition(a: TreeNode, b: TreeNode): number {
  return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
}

function folderName(node: TreeNode | undefined): string {
  return node?.name?.trim() || 'Carpeta';
}

/** Descendientes de `rootId` a cualquier profundidad, sin incluirlo. */
function descendantsOf(nodes: TreeNode[], rootId: string): TreeNode[] {
  const byParent = new Map<string, TreeNode[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = byParent.get(n.parentId);
    if (list) list.push(n);
    else byParent.set(n.parentId, [n]);
  }
  const out: TreeNode[] = [];
  const stack = [rootId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const child of byParent.get(id) ?? []) {
      out.push(child);
      stack.push(child.id);
    }
  }
  return out;
}

export function App() {
  const params = new URLSearchParams(window.location.search);
  const rootFolderId = params.get('folderId') ?? '';
  const workspaceId = params.get('workspaceId') ?? '';

  const [allNodes, setAllNodes] = useState<TreeNode[]>([]);
  const [folderStack, setFolderStack] = useState<string[]>([rootFolderId]);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useViewModeSetting('folder-view:view-mode');
  const [pendingDelete, setPendingDelete] = useState<{ node: TreeNode; count: number } | null>(null);

  const currentFolderId = folderStack[folderStack.length - 1] ?? rootFolderId;

  useEffect(() => {
    themeManager.initialize();
    return () => themeManager.destroy();
  }, []);

  const loadTree = useCallback(async () => {
    if (!workspaceId) return;
    const res = await window.api.tree.getByWorkspace({ workspaceId });
    if (res.ok) setAllNodes(res.data);
  }, [workspaceId]);

  useEffect(() => {
    void loadTree();
    const off = window.api.on(IPC_EVENTS.TREE_CHANGED, (payload) => {
      if (payload.workspaceId === workspaceId) void loadTree();
    });
    return off;
  }, [loadTree, workspaceId]);

  const nodeById = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes]);
  const currentFolder = nodeById.get(currentFolderId);

  // Si la carpeta mostrada desaparece (borrada desde la sidebar), volver al
  // nivel más profundo que siga existiendo.
  useEffect(() => {
    if (allNodes.length === 0) return;
    if (folderStack.every((id) => nodeById.has(id))) return;
    const alive = folderStack.filter((id) => nodeById.has(id));
    setFolderStack(alive.length > 0 ? alive : [rootFolderId]);
  }, [allNodes.length, folderStack, nodeById, rootFolderId]);

  const toItem = useCallback((node: TreeNode, hint: string | null): CollectionItem => {
    if (isFolderLike(node)) {
      return {
        id: node.id, kind: 'folder', title: folderName(node), editableTitle: node.name ?? '',
        icon: node.icon ?? null, color: node.color ?? null, hint,
      };
    }
    const tab = node as TabNode;
    return {
      id: tab.id, kind: 'link', title: deriveTabTitle(tab), editableTitle: tab.name ?? '',
      url: tab.url, favicon: tab.favicon, hint,
    };
  }, []);

  const items = useMemo<CollectionItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return allNodes
        .filter((n) => n.parentId === currentFolderId)
        .sort(byPosition)
        .map((n) => toItem(n, null));
    }
    // El buscador recorre también las subcarpetas.
    return descendantsOf(allNodes, currentFolderId)
      .filter((n) => {
        const name = isFolderLike(n) ? folderName(n) : deriveTabTitle(n as TabNode);
        return name.toLowerCase().includes(q) ||
          (n.kind === 'tab' && (n as TabNode).url.toLowerCase().includes(q));
      })
      .sort(byPosition)
      .map((n) => toItem(n, n.parentId && n.parentId !== currentFolderId ? folderName(nodeById.get(n.parentId)) : null));
  }, [allNodes, currentFolderId, query, toItem, nodeById]);

  const breadcrumb: BreadcrumbEntry[] = folderStack.map((id) => ({ id, label: folderName(nodeById.get(id)) }));

  const navigateTo = useCallback((id: string | null) => {
    if (!id) return;
    setFolderStack((prev) => {
      const idx = prev.indexOf(id);
      return idx === -1 ? prev : prev.slice(0, idx + 1);
    });
    setQuery('');
  }, []);

  const openFolder = useCallback((id: string) => {
    // Desde un resultado de búsqueda, reconstruir la ruta desde la carpeta actual.
    const path: string[] = [];
    let cur: string | null = id;
    const seen = new Set<string>();
    while (cur && cur !== currentFolderId && !seen.has(cur)) {
      seen.add(cur);
      path.unshift(cur);
      cur = nodeById.get(cur)?.parentId ?? null;
    }
    setFolderStack((prev) => [...prev, ...path]);
    setQuery('');
  }, [currentFolderId, nodeById]);

  const handleOpen = useCallback(async (item: CollectionItem) => {
    const node = nodeById.get(item.id);
    if (!node) return;
    if (item.kind === 'folder') {
      openFolder(node.id);
      return;
    }
    const tab = node as TabNode;
    if (tab.workspaceId !== workspaceId) {
      await window.api.workspaces.setActive({ id: tab.workspaceId });
    }
    await window.api.tab.activate({ id: tab.id });
  }, [nodeById, openFolder, workspaceId]);

  const handleSave = useCallback(async (item: CollectionItem, result: CollectionEditResult): Promise<string | null> => {
    if (item.kind === 'folder' && !result.title) return 'El nombre no puede quedar vacío';
    // En una pestaña, un nombre vacío restaura el título original de la página.
    const res = await window.api.node.rename({ id: item.id, name: result.title });
    return res.ok ? null : 'No se pudo renombrar';
  }, []);

  const handleDelete = useCallback((item: CollectionItem) => {
    const node = nodeById.get(item.id);
    if (!node) return;
    if (item.kind === 'link') {
      void window.api.tab.close({ id: node.id }).then((res) => {
        if (res.ok) toast(`Pestaña cerrada: ${item.title} (Ctrl+Shift+T para reabrirla)`);
      });
      return;
    }
    const count = descendantsOf(allNodes, node.id).length;
    if (count === 0) {
      void window.api.node.delete({ id: node.id, cascade: false });
      return;
    }
    setPendingDelete({ node, count });
  }, [allNodes, nodeById]);

  const confirmDelete = useCallback((actionId: string) => {
    if (!pendingDelete) return;
    void window.api.node.delete({ id: pendingDelete.node.id, cascade: actionId === 'all' });
    setPendingDelete(null);
  }, [pendingDelete]);

  const canRename = !!currentFolder && isFolderLike(currentFolder);

  return (
    <CollectionView
      title={folderName(currentFolder)}
      titleIcon={currentFolder?.icon ?? null}
      tint={currentFolder?.color ?? null}
      onRenameTitle={canRename ? async (name) => { await window.api.node.rename({ id: currentFolderId, name }); } : undefined}
      breadcrumb={breadcrumb}
      onNavigate={navigateTo}
      query={query}
      onQueryChange={setQuery}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      items={items}
      emptyText="Carpeta vacía"
      editUrl={false}
      allowEmptyName
      onOpen={(item) => void handleOpen(item)}
      onSave={handleSave}
      onDelete={handleDelete}
    >
      {pendingDelete && (
        <ConfirmDialog
          title={`Eliminar «${folderName(pendingDelete.node)}»`}
          message={`La carpeta contiene ${pendingDelete.count} ${pendingDelete.count === 1 ? 'elemento' : 'elementos'}. Puedes conservarlos (pasan a la carpeta superior) o eliminarlos con ella; las pestañas eliminadas se cierran.`}
          actions={[
            { id: 'keep', label: 'Eliminar solo la carpeta' },
            { id: 'all', label: 'Eliminar todo', danger: true },
          ]}
          onSelect={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      <Toaster />
    </CollectionView>
  );
}

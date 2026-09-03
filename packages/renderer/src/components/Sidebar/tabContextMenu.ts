import { generateKeyBetween } from 'fractional-indexing';
import type { MenuItemSpec, TabNode } from '@vela/shared';
import { useTreeStore } from '../../stores/treeStore';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';
import { useSidebarStore } from '../../stores/sidebarStore';
import { toast } from '../../stores/toastStore';
import { call, IpcError } from '../../lib/ipc';
import { showContextMenu, type MenuActionMap } from '../../lib/contextMenu';
import { writeToClipboard } from '../../lib/clipboard';

/**
 * Menú contextual de una pestaña. Es el mismo para el árbol de la sidebar,
 * para las Cargas (pinned) y para las Anclas: cada sitio solo aporta cómo
 * renombra, porque la UI de renombrado es distinta en cada barra.
 */
export interface TabContextMenuOptions {
  node: TabNode;
  /** Si la pestaña es la activa de la ventana (no se puede suspender). */
  isActive: boolean;
  /** Abre la UI de renombrado propia del contenedor. */
  onRename: () => void;
}

async function pinWithToast(id: string): Promise<void> {
  try {
    await call(() => window.api.tab.pin({ id }));
  } catch (err) {
    if (err instanceof IpcError && err.details === 'CANNOT_PIN_NESTED_TAB') {
      toast('No se puede fijar una pestaña dentro de una carpeta', 'warning');
      return;
    }
    throw err;
  }
}

function lastRootPosition(workspaceId: string): string | null {
  const nodes = useTreeStore.getState().nodesByWorkspace[workspaceId] ?? [];
  const roots = nodes.filter((n) => n.parentId === null);
  if (roots.length === 0) return null;
  return roots.reduce(
    (max, n) => (n.position > max ? n.position : max),
    roots[0]!.position,
  );
}

export async function showTabContextMenu({
  node,
  isActive,
  onRename,
}: TabContextMenuOptions): Promise<void> {
  const treeStore = useTreeStore.getState();
  const runtimeStore = useRuntimeStore.getState();
  const workspaces = useWorkspacesStore.getState().workspaces;
  const treeNodes = treeStore.nodesByWorkspace[node.workspaceId] ?? [];
  const isAnchor = treeStore.anchoredTabs.some((t) => t.id === node.id);
  const isHttp =
    node.url.startsWith('http://') || node.url.startsWith('https://');

  // El estado de whitelist permanente solo hace falta para etiquetar el ítem,
  // así que se consulta al abrir el menú y no al montar cada fila.
  let isPermanentlyWhitelisted = false;
  try {
    const res = await window.api.discard.getWhitelistStatus({ tabId: node.id });
    if (res.ok) isPermanentlyWhitelisted = res.data.permanent;
  } catch {
    /* si falla, se asume que no está en la whitelist */
  }

  async function moveToWorkspaceRoot(): Promise<void> {
    await call(() =>
      window.api.node.move({
        id: node.id,
        newParentId: null,
        newPosition: generateKeyBetween(
          lastRootPosition(node.workspaceId),
          null,
        ),
        newWorkspaceId: node.workspaceId,
      }),
    );
  }

  async function addToNewFolder(): Promise<void> {
    const allNodes =
      useTreeStore.getState().nodesByWorkspace[node.workspaceId] ?? [];
    const siblings = allNodes
      .filter((n) => n.parentId === node.parentId)
      .sort((a, b) =>
        a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
      );
    const nodeIdx = siblings.findIndex((n) => n.id === node.id);
    const nextSibling = siblings[nodeIdx + 1];
    const folderPosition = generateKeyBetween(
      node.position,
      nextSibling?.position ?? null,
    );

    const newFolder = await useTreeStore.getState().createFolder({
      workspaceId: node.workspaceId,
      parentId: node.parentId,
      name: 'Nueva carpeta',
      position: folderPosition,
    });

    await useTreeStore.getState().moveNode({
      id: node.id,
      newParentId: newFolder.id,
      newPosition: generateKeyBetween(null, null),
    });

    void runtimeStore.activateTab(newFolder.id);
    useSidebarStore.getState().setPendingRenameId(newFolder.id);
  }

  const otherWorkspaces = workspaces.filter((w) => w.id !== node.workspaceId);
  const moveSubmenu: MenuItemSpec[] =
    otherWorkspaces.length === 0
      ? [
          {
            type: 'normal',
            id: 'noop:no-other-workspaces',
            label: '(solo hay un workspace)',
            enabled: false,
          },
        ]
      : otherWorkspaces.map((w) => ({
          type: 'normal' as const,
          id: `move-to-workspace:${w.id}`,
          label: w.name,
          enabled: true,
        }));

  const discardSection: MenuItemSpec[] = node.discarded
    ? [
        { type: 'separator' },
        { type: 'normal', id: 'restore-tab', label: 'Reactivar esta pestaña' },
        {
          type: 'normal',
          id: 'restore-workspace',
          label: 'Reactivar todas las pestañas del workspace',
        },
      ]
    : [
        { type: 'separator' },
        {
          type: 'normal',
          id: 'discard-tab',
          label: 'Suspender esta pestaña',
          enabled: !isActive,
        },
        ...(node.parentId
          ? [
              {
                type: 'normal' as const,
                id: 'discard-folder',
                label: 'Suspender todas las pestañas de esta carpeta',
              },
            ]
          : []),
        {
          type: 'normal',
          id: 'discard-workspace',
          label: 'Suspender todas las pestañas del workspace',
        },
        {
          type: 'normal',
          id: 'toggle-permanent-whitelist',
          label: isPermanentlyWhitelisted
            ? '✓ Mantener siempre activa'
            : 'Mantener siempre activa',
        },
      ];

  const items: MenuItemSpec[] = [
    { type: 'normal', id: 'rename', label: 'Renombrar' },
    { type: 'normal', id: 'close', label: 'Cerrar' },
    { type: 'normal', id: 'close-others', label: 'Cerrar otras (este nivel)' },
    { type: 'normal', id: 'close-all', label: 'Cerrar todas' },
    { type: 'separator' },
    ...(node.pinned
      ? [{ type: 'normal' as const, id: 'unpin', label: 'Desestibar Carga' }]
      : [{ type: 'normal' as const, id: 'pin', label: 'Estibar Carga' }]),
    ...(node.pinned && node.pinnedUrl
      ? [
          {
            type: 'normal' as const,
            id: 'restore-pinned',
            label: 'Restaurar Carga',
          },
          {
            type: 'normal' as const,
            id: 'replace-pinned',
            label: 'Reemplazar Carga',
          },
        ]
      : []),
    {
      type: 'normal',
      id: isAnchor ? 'remove-anchor' : 'add-anchor',
      label: isAnchor ? 'Levar Ancla' : 'Anclar Ancla',
      enabled: isHttp,
    },
    ...(isAnchor && node.anchoredUrl
      ? [
          {
            type: 'normal' as const,
            id: 'restore-anchor',
            label: 'Restaurar Ancla',
          },
          {
            type: 'normal' as const,
            id: 'replace-anchor',
            label: 'Reemplazar Ancla',
          },
        ]
      : []),
    // Una pestaña no puede estar a la vez estibada/anclada y dentro de una carpeta.
    {
      type: 'normal',
      id: 'add-to-folder',
      label: 'Añadir a carpeta',
      enabled: !node.pinned && !isAnchor,
    },
    { type: 'submenu', label: 'Mover a workspace', submenu: moveSubmenu },
    { type: 'separator' },
    { type: 'normal', id: 'copy-url', label: 'Copiar enlace', enabled: isHttp },
    { type: 'normal', id: 'duplicate', label: 'Duplicar' },
    {
      type: 'normal',
      id: 'open-secure',
      label: 'Abrir en pestaña fantasma',
      enabled: isHttp,
    },
    {
      type: 'normal',
      id: 'open-blinded-window',
      label: 'Nueva ventana fantasma',
    },
    { type: 'normal', id: 'delete', label: 'Eliminar' },
    ...discardSection,
  ];

  const actions: MenuActionMap = {
    rename: onRename,
    'add-to-folder': () => void addToNewFolder(),
    close: () => void runtimeStore.closeTab(node.id),
    'close-others': () => {
      for (const s of treeNodes) {
        if (
          s.kind === 'tab' &&
          s.id !== node.id &&
          s.parentId === node.parentId
        ) {
          void runtimeStore.closeTab(s.id);
        }
      }
    },
    'close-all': () => {
      for (const t of treeNodes) {
        if (t.kind === 'tab') void runtimeStore.closeTab(t.id);
      }
    },
    pin: () =>
      void (async () => {
        if (node.parentId !== null) await moveToWorkspaceRoot();
        await pinWithToast(node.id);
      })(),
    unpin: () => void window.api.tab.unpin({ id: node.id }),
    'restore-pinned': () =>
      void window.api.tab.restorePinnedUrl({ id: node.id }),
    'replace-pinned': () =>
      void window.api.tab.replacePinnedUrl({ id: node.id }),
    'add-anchor': () =>
      void (async () => {
        if (node.parentId !== null) await moveToWorkspaceRoot();
        await call(() => window.api.tab.anchor({ id: node.id }));
      })(),
    'remove-anchor': () => void window.api.tab.unanchor({ id: node.id }),
    'restore-anchor': () =>
      void window.api.tab.restoreAnchoredUrl({ id: node.id }),
    'replace-anchor': () =>
      void window.api.tab.replaceAnchoredUrl({ id: node.id }),
    'copy-url': () => {
      void writeToClipboard(node.url).then(() => {
        toast('Enlace copiado al portapapeles', 'success');
      });
    },
    duplicate: () =>
      void window.api.window.openUrlInNewTab({
        url: node.url,
        parentId: node.parentId,
      }),
    'open-secure': () => void window.api.tab.createSecure({ url: node.url }),
    'open-blinded-window': () => void window.api.window.openBlindedWindow(),
    delete: () => void useTreeStore.getState().deleteNode({ id: node.id }),
    'discard-tab': () => {
      void call(() => window.api.discard.discardTab({ tabId: node.id })).catch(
        (err) => {
          // El único fallo esperado es intentar suspender la tab activa (en
          // esta u otra ventana): el main lo rechaza con INVARIANT.
          if (err instanceof IpcError && err.code === 'INVARIANT') {
            toast(
              'No se puede suspender la pestaña activa. Cambia a otra primero.',
              'warning',
            );
            return;
          }
          throw err;
        },
      );
    },
    'discard-folder': () => {
      if (node.parentId) {
        void call(() =>
          window.api.discard.discardFolder({ folderId: node.parentId! }),
        );
      }
    },
    'discard-workspace': () =>
      void call(() =>
        window.api.discard.discardWorkspace({ workspaceId: node.workspaceId }),
      ),
    'restore-tab': () =>
      void call(() => window.api.discard.restoreTab({ tabId: node.id })),
    'restore-workspace': () =>
      void call(() =>
        window.api.discard.restoreWorkspace({ workspaceId: node.workspaceId }),
      ),
    'toggle-permanent-whitelist': () => {
      void call(() =>
        window.api.discard.togglePermanentWhitelist({ tabId: node.id }),
      );
    },
  };

  for (const w of otherWorkspaces) {
    actions[`move-to-workspace:${w.id}`] = () => {
      void call(() =>
        window.api.node.move({
          id: node.id,
          newParentId: null,
          newPosition: generateKeyBetween(lastRootPosition(w.id), null),
          newWorkspaceId: w.id,
        }),
      );
    };
  }

  await showContextMenu(items, actions);
}

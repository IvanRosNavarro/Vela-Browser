import { useEffect, useState, type CSSProperties } from 'react';
import { generateKeyBetween } from 'fractional-indexing';
import type { FolderNode, MenuItemSpec, SidebarMode, TabNode } from '@vela/shared';
import { isFolderLike, isFolderTab } from '@vela/shared';
import { useNodeDrag } from './useNodeDrag';
import { useNodeDrop } from './useNodeDrop';
import { DropIndicator } from './DropIndicator';
import { InlineRename } from './InlineRename';
import { useTreeStore } from '../../stores/treeStore';
import {
  selectDescendantCount,
  type TreeState,
} from '../../stores/treeStore';
import { call } from '../../lib/ipc';
import { showContextMenu } from '../../lib/contextMenu';
import { useSidebarStore } from '../../stores/sidebarStore';
import { useRuntimeStore } from '../../stores/runtimeStore';
import type { ActiveDrop } from './types';
import type { DropZone } from './dropValidation';

interface FolderRowProps {
  node: FolderNode | TabNode;
  depth: number;
  mode: SidebarMode;
  rowHeight: number;
  indent: number;
  inheritedColor: string | null;
  inheritedColorEnabled: boolean;
  isActive?: boolean;
  activeDrop: ActiveDrop | null;
}

const PALETTE: Array<{ id: string; label: string; color: string | null }> = [
  { id: 'none', label: '(sin color)', color: null },
  { id: 'blue', label: 'Azul', color: '#7d8cff' },
  { id: 'teal', label: 'Turquesa', color: '#5cd2c2' },
  { id: 'amber', label: 'Ámbar', color: '#f6c177' },
  { id: 'rose', label: 'Rosa', color: '#ed8796' },
  { id: 'green', label: 'Verde', color: '#a6e3a1' },
  { id: 'lavender', label: 'Lavanda', color: '#cba6f7' },
  { id: 'red', label: 'Rojo', color: '#f38ba8' },
];

const ICONS = ['📁', '📚', '🛠', '🎨', '🧪', '📊', '🌐', '⭐'];

export function FolderRow({
  node,
  depth,
  mode,
  rowHeight,
  indent,
  inheritedColor,
  inheritedColorEnabled,
  isActive,
  activeDrop,
}: FolderRowProps) {
  const isTab = isFolderTab(node);
  const drag = useNodeDrag(node);
  const drop = useNodeDrop(node);
  const [renaming, setRenaming] = useState(false);
  const [isFolderWhitelisted, setIsFolderWhitelisted] = useState(false);

  useEffect(() => {
    void window.api.settings.get({ key: 'tabs:discard-folder-whitelists' }).then((res) => {
      if (!res.ok) return;
      try {
        const map = (res.data.value ?? {}) as Record<string, boolean>;
        setIsFolderWhitelisted(!!map[node.id]);
      } catch { /* ignore */ }
    }).catch(() => {});
  }, [node.id]);

  const toggleCollapse = useTreeStore((s) => s.toggleCollapse);
  const renameNode = useTreeStore((s) => s.renameNode);
  const updateNode = useTreeStore((s) => s.updateNode);
  const deleteNode = useTreeStore((s) => s.deleteNode);
  const createFolder = useTreeStore((s) => s.createFolder);
  const moveNode = useTreeStore((s) => s.moveNode);
  const descendantCount = useTreeStore((s: TreeState) =>
    selectDescendantCount(s, node.workspaceId, node.id),
  );

  const pendingRenameId = useSidebarStore((s) => s.pendingRenameId);
  const setPendingRenameId = useSidebarStore((s) => s.setPendingRenameId);
  const activateTab = useRuntimeStore((s) => s.activateTab);

  useEffect(() => {
    if (pendingRenameId === node.id) {
      setRenaming(true);
      setPendingRenameId(null);
    }
  }, [pendingRenameId, node.id, setPendingRenameId]);

  const compact = mode === 'compact';
  const dropZone = activeDrop?.targetId === node.id ? activeDrop.zone : null;
  const isInvalidTarget =
    activeDrop?.targetId === node.id && activeDrop.invalid;

  const opacity = drag.isDragging ? 0.4 : 1;
  const markerColor = node.color ?? 'var(--vela-folder-marker-default)';
  const name = node.name ?? 'Carpeta';
  const initial = (name.charAt(0) || '·').toUpperCase();

  const rowStyle: CSSProperties = {
    height: rowHeight,
    paddingLeft: compact
      ? Math.min(depth * indent, 16)
      : depth * indent + 6,
    paddingRight: compact ? 0 : 6,
    opacity,
    background: isActive ? 'var(--vela-tab-active-bg)' : undefined,
    color: isActive ? 'var(--vela-tab-active-fg)' : undefined,
  };

  const transformStyle: CSSProperties = drag.transform
    ? {
        transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)`,
      }
    : {};

  function setCollapseRecursive(collapsed: boolean) {
    void toggleCollapse(node.id, collapsed);
    const all = useTreeStore.getState().nodesByWorkspace[node.workspaceId] ?? [];
    const stack = [node.id];
    while (stack.length > 0) {
      const id = stack.pop()!;
      for (const n of all) {
        if (n.parentId === id && isFolderLike(n)) {
          if (n.collapsed !== collapsed) {
            void toggleCollapse(n.id, collapsed);
          }
          stack.push(n.id);
        }
      }
    }
  }

  async function addToNewFolder() {
    const allNodes = useTreeStore.getState().nodesByWorkspace[node.workspaceId] ?? [];
    const siblings = allNodes
      .filter((n) => n.parentId === node.parentId)
      .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
    const nodeIdx = siblings.findIndex((n) => n.id === node.id);
    const nextSibling = siblings[nodeIdx + 1];
    const folderPosition = generateKeyBetween(node.position, nextSibling?.position ?? null);

    const newFolder = await createFolder({
      workspaceId: node.workspaceId,
      parentId: node.parentId,
      name: 'Nueva carpeta',
      position: folderPosition,
    });

    await moveNode({
      id: node.id,
      newParentId: newFolder.id,
      newPosition: generateKeyBetween(null, null),
    });

    void activateTab(newFolder.id);
    useSidebarStore.getState().setPendingRenameId(newFolder.id);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const colorSubmenu: MenuItemSpec[] = PALETTE.map((p) => ({
      type: 'normal' as const,
      id: `color:${p.id}`,
      label: p.label,
    }));

    const iconSubmenu: MenuItemSpec[] = [
      ...ICONS.map((emoji, idx) => ({
        type: 'normal' as const,
        id: `icon:${idx}`,
        label: emoji,
      })),
      { type: 'separator' as const },
      { type: 'normal' as const, id: 'icon:clear', label: '(limpiar)' },
    ];

    const items: MenuItemSpec[] = [
      { type: 'normal', id: 'rename', label: 'Renombrar' },
      { type: 'normal', id: 'add-to-folder', label: 'Añadir a carpeta' },
      { type: 'submenu', label: 'Color', submenu: colorSubmenu },
      { type: 'submenu', label: 'Icono', submenu: iconSubmenu },
      { type: 'separator' },
      { type: 'normal', id: 'new-folder', label: 'Nueva carpeta dentro' },
      { type: 'normal', id: 'new-tab', label: 'Nueva pestaña dentro' },
      { type: 'separator' },
      { type: 'normal', id: 'collapse-all', label: 'Colapsar todo' },
      { type: 'normal', id: 'expand-all', label: 'Expandir todo' },
      { type: 'separator' },
      { type: 'normal', id: 'discard-folder', label: 'Suspender todas las pestañas de esta carpeta' },
      { type: 'normal', id: 'restore-folder', label: 'Reactivar todas las pestañas de esta carpeta' },
      {
        type: 'normal',
        id: 'toggle-folder-whitelist',
        label: isFolderWhitelisted
          ? '✓ No suspender pestañas de esta carpeta'
          : 'No suspender pestañas de esta carpeta',
      },
      { type: 'separator' },
      {
        type: 'submenu',
        label: 'Eliminar',
        submenu: [
          {
            type: 'normal',
            id: 'delete-promote',
            label: 'Solo la carpeta (promover hijos)',
          },
          {
            type: 'normal',
            id: 'delete-cascade',
            label: 'Carpeta y descendientes',
          },
        ],
      },
    ];

    const colorActions: Record<string, () => void> = {};
    for (const p of PALETTE) {
      colorActions[`color:${p.id}`] = () =>
        void updateNode({ id: node.id, color: p.color });
    }

    const iconActions: Record<string, () => void> = {};
    ICONS.forEach((emoji, idx) => {
      iconActions[`icon:${idx}`] = () =>
        void updateNode({ id: node.id, icon: emoji });
    });
    iconActions['icon:clear'] = () =>
      void updateNode({ id: node.id, icon: null });

    void showContextMenu(items, {
      rename: () => setRenaming(true),
      'add-to-folder': () => void addToNewFolder(),
      ...colorActions,
      ...iconActions,
      'new-folder': () =>
        void (async () => {
          const newFolder = await createFolder({
            workspaceId: node.workspaceId,
            parentId: node.id,
            name: 'Carpeta',
          });
          void activateTab(newFolder.id);
          useSidebarStore.getState().setPendingRenameId(newFolder.id);
        })(),
      'new-tab': () =>
        void window.api.window.openUrlInNewTab({
          url: 'vela://newtab',
          parentId: node.id,
          activate: true,
        }),
      'collapse-all': () => setCollapseRecursive(true),
      'expand-all': () => setCollapseRecursive(false),
      'discard-folder': () =>
        void call(() => window.api.discard.discardFolder({ folderId: node.id })),
      'restore-folder': () => {
        const all = useTreeStore.getState().nodesByWorkspace[node.workspaceId] ?? [];
        for (const n of all) {
          if (n.parentId === node.id && n.kind === 'tab' && n.discarded) {
            void call(() => window.api.discard.restoreTab({ tabId: n.id }));
          }
        }
      },
      'toggle-folder-whitelist': () => {
        void call(() => window.api.discard.toggleFolderWhitelist({ folderId: node.id })).then((res) => {
          setIsFolderWhitelisted(res.whitelisted);
        });
      },
      'delete-promote': () =>
        void deleteNode({ id: node.id, cascade: false }),
      'delete-cascade': () => void deleteNode({ id: node.id, cascade: true }),
    });
  }

  return (
    <div
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      onAuxClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onContextMenu={handleContextMenu}
      className="group relative flex cursor-default items-center select-none hover:bg-[var(--vela-bg-folder-hover)]"
      style={{ ...rowStyle, ...transformStyle }}
      data-folder-id={node.id}
    >
      {inheritedColorEnabled && inheritedColor && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 1,
            background: inheritedColor,
            opacity: 'var(--vela-inherit-line-alpha)',
          }}
        />
      )}

      <div
        ref={drop.before.setNodeRef}
        style={{ position: 'absolute', inset: 0, height: '25%', pointerEvents: 'none' }}
        aria-hidden
      />
      <div
        ref={drop.after.setNodeRef}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '75%',
          bottom: 0,
          pointerEvents: 'none',
        }}
        aria-hidden
      />
      {drop.inside && (
        <div
          ref={drop.inside.setNodeRef}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '25%',
            bottom: '25%',
            pointerEvents: 'none',
          }}
          aria-hidden
        />
      )}

      <span
        aria-hidden
        style={{
          width: 'var(--vela-folder-marker-w)',
          height: '70%',
          borderRadius: 2,
          background: markerColor,
          flex: '0 0 auto',
          marginRight: compact ? 0 : 6,
        }}
      />

      {compact ? (
        <div
          className="mx-auto flex items-center justify-center"
          data-chevron
          onClick={(e) => {
            e.stopPropagation();
            void toggleCollapse(node.id);
          }}
          style={{
            width: 22,
            height: 22,
            borderRadius: 4,
            background: 'var(--vela-bg-folder-hover)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--vela-fg-muted)',
          }}
        >
          {node.icon ?? initial}
        </div>
      ) : (
        <>
          <button
            type="button"
            aria-label={node.collapsed ? 'Expandir' : 'Colapsar'}
            data-chevron
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void toggleCollapse(node.id);
            }}
            className="flex h-3.5 w-3.5 items-center justify-center rounded text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
            style={{ fontSize: 9 }}
          >
            {node.collapsed ? '▶' : '▼'}
          </button>

          <span
            aria-hidden
            className="ml-1 inline-flex items-center justify-center"
            style={{
              width: 16,
              height: 16,
              fontSize: 12,
              color: 'var(--vela-fg-muted)',
            }}
          >
            {node.icon ?? '📁'}
          </span>

          {renaming ? (
            <div className="ml-2 flex min-w-0 flex-1 items-center">
              <InlineRename
                initial={name}
                onCommit={(next) => {
                  setRenaming(false);
                  void renameNode({ id: node.id, name: next });
                }}
                onCancel={() => setRenaming(false)}
              />
            </div>
          ) : (
            <span
              data-folder-name
              className="ml-2 flex-1 overflow-hidden whitespace-nowrap text-[13px] font-medium"
              style={{
                maskImage: 'linear-gradient(to right, black calc(100% - 2rem), transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 2rem), transparent 100%)',
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (isTab) {
                  void activateTab(node.id);
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setRenaming(true);
              }}
            >
              {name}
            </span>
          )}

          {node.collapsed && descendantCount > 0 && (
            <span
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full px-1.5 text-[11px] text-[var(--vela-fg-muted)]"
              style={{ background: 'var(--vela-bg-folder-hover)' }}
            >
              {descendantCount}
            </span>
          )}
        </>
      )}

      {dropZone && !isInvalidTarget && (
        <DropIndicator zone={dropZone as DropZone} visible />
      )}
    </div>
  );
}

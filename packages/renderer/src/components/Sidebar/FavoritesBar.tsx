// Franja de pestañas ancladas (pinned: true) en la parte superior del sidebar.
// Reutiliza la lógica de drag-and-drop del DndContext del padre (Sidebar).
import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import type { CSSProperties } from 'react';
import type { MenuItemSpec, TabNode } from '@vela/shared';
import { useTreeStore } from '../../stores/treeStore';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { Favicon } from './Favicon';
import { selectPinnedTabs } from './flatList';
import {
  encodeDroppableId,
  PINNED_TARGET_ID,
  type DropZone,
} from './dropValidation';
import { showContextMenu } from '../../lib/contextMenu';
import type { ActiveDrop } from './types';

interface FavoritesBarProps {
  workspaceId: string;
  activeDrop: ActiveDrop | null;
}

function FavoriteItem({
  node,
  isActive,
  activeDrop,
}: {
  node: TabNode;
  isActive: boolean;
  activeDrop: ActiveDrop | null;
}) {
  const drag = useDraggable({
    id: node.id,
    data: {
      kind: node.kind,
      parentId: node.parentId,
      workspaceId: node.workspaceId,
    },
  });
  const before = useDroppable({
    id: encodeDroppableId(node.id, 'before'),
    data: {
      nodeId: node.id,
      parentId: node.parentId,
      workspaceId: node.workspaceId,
      kind: node.kind,
      zone: 'before' as DropZone,
    },
  });
  const after = useDroppable({
    id: encodeDroppableId(node.id, 'after'),
    data: {
      nodeId: node.id,
      parentId: node.parentId,
      workspaceId: node.workspaceId,
      kind: node.kind,
      zone: 'after' as DropZone,
    },
  });

  const activateTab = useRuntimeStore((s) => s.activateTab);
  const closeTab = useRuntimeStore((s) => s.closeTab);

  const title = node.name || node.originalTitle || node.url;

  function handleAuxClick(e: React.MouseEvent) {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    void closeTab(node.id);
  }
  const dropZone = activeDrop?.targetId === node.id ? activeDrop.zone : null;

  const transformStyle: CSSProperties = drag.transform
    ? { transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` }
    : {};

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const items: MenuItemSpec[] = [
      ...(node.pinnedUrl ? [
        { type: 'normal' as const, id: 'restore-pinned', label: 'Restaurar Carga' },
        { type: 'normal' as const, id: 'replace-pinned', label: 'Reemplazar Carga' },
        { type: 'separator' as const },
      ] : []),
      { type: 'normal', id: 'unpin', label: 'Desestibar Carga' },
      { type: 'normal', id: 'close', label: 'Cerrar' },
    ];
    void showContextMenu(items, {
      'restore-pinned': () => void window.api.tab.restorePinnedUrl({ id: node.id }),
      'replace-pinned': () => void window.api.tab.replacePinnedUrl({ id: node.id }),
      unpin: () => void window.api.tab.unpin({ id: node.id }),
      close: () => closeTab(node.id),
    });
  }

  return (
    <div
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      onClick={() => void activateTab(node.id)}
      onAuxClick={handleAuxClick}
      onContextMenu={handleContextMenu}
      title={title}
      className="relative flex shrink-0 cursor-default items-center justify-center rounded-md hover:bg-[var(--vela-bg-row-hover)]"
      style={{
        width: 32,
        height: 32,
        opacity: drag.isDragging ? 0.4 : 1,
        background: isActive ? 'var(--vela-tab-active-bg)' : undefined,
        ...transformStyle,
      }}
    >
      <div ref={before.setNodeRef} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%' }} aria-hidden />
      <div ref={after.setNodeRef}  style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '50%' }} aria-hidden />
      <Favicon src={node.favicon} alt={title} size={20} fallbackChar={title.charAt(0) || '·'} />
      {/* Indicador de drift: la Carga ha navegado fuera de su URL anclada */}
      {node.pinnedUrl && node.url !== node.pinnedUrl && (
        <span
          aria-hidden
          title="URL diferente a la Carga original"
          style={{
            position: 'absolute',
            bottom: 3,
            right: 3,
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'var(--vela-warning, #f59e0b)',
            border: '1px solid var(--vela-bg-sidebar)',
          }}
        />
      )}
      {dropZone === 'before' && (
        <span aria-hidden style={{ position: 'absolute', top: 4, bottom: 4, left: -2, width: 2, borderRadius: 2, background: 'var(--vela-drop-line)' }} />
      )}
      {dropZone === 'after' && (
        <span aria-hidden style={{ position: 'absolute', top: 4, bottom: 4, right: -2, width: 2, borderRadius: 2, background: 'var(--vela-drop-line)' }} />
      )}
    </div>
  );
}

export function FavoritesBar({ workspaceId, activeDrop }: FavoritesBarProps) {
  const pinned = useTreeStore((s) => selectPinnedTabs(s, workspaceId));
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabId = useRuntimeStore((s) =>
    currentWindowId !== null ? (s.activeTabIdByWindow[currentWindowId] ?? null) : null,
  );

  const sectionDrop = useDroppable({
    id: encodeDroppableId(PINNED_TARGET_ID, 'inside'),
    data: {
      nodeId: PINNED_TARGET_ID,
      parentId: null,
      workspaceId,
      kind: 'tab' as const,
      zone: 'inside' as DropZone,
    },
  });

  const dnd = useDndContext();
  const isDragging = dnd.active !== null;
  const draggedIsTab = (dnd.active?.data.current as { kind?: string } | null)?.kind === 'tab';
  const isPinnedTarget = activeDrop?.targetId === PINNED_TARGET_ID && !activeDrop.invalid;

  if (pinned.length === 0) {
    if (!isDragging || !draggedIsTab) return null;
    return (
      <div
        ref={sectionDrop.setNodeRef}
        className="shrink-0 border-b px-1.5 py-2 text-center text-[11px] text-[var(--vela-fg-muted)]"
        style={{
          borderColor: 'var(--vela-border)',
          background: isPinnedTarget ? 'var(--vela-drop-bg)' : undefined,
          outline: isPinnedTarget ? '1px dashed var(--vela-drop-line)' : undefined,
          minHeight: 32,
        }}
        aria-label="Carga (vacío)"
      >
        Soltar para estibar
      </div>
    );
  }

  return (
    <div
      ref={sectionDrop.setNodeRef}
      className="flex shrink-0 flex-wrap gap-1 overflow-x-auto border-b px-1.5 py-2"
      style={{
        borderColor: 'var(--vela-border)',
        background: isPinnedTarget ? 'var(--vela-drop-bg)' : undefined,
        outline: isPinnedTarget ? '1px dashed var(--vela-drop-line)' : undefined,
        outlineOffset: -1,
      }}
      role="list"
      aria-label="Carga"
    >
      {pinned.map((node) => (
        <FavoriteItem
          key={node.id}
          node={node as TabNode}
          isActive={node.id === activeTabId}
          activeDrop={activeDrop}
        />
      ))}
    </div>
  );
}

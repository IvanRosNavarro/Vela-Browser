import { useDndContext, useDraggable, useDroppable } from '@dnd-kit/core';
import type { CSSProperties } from 'react';
import type { MenuItemSpec, SidebarMode, TabNode } from '@vela/shared';
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

interface PinnedTabsProps {
  workspaceId: string;
  mode: SidebarMode;
  activeDrop: ActiveDrop | null;
}

function PinnedTab({
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
  const dropZone = activeDrop?.targetId === node.id ? activeDrop.zone : null;

  const transformStyle: CSSProperties = drag.transform
    ? {
        transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)`,
      }
    : {};

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const items: MenuItemSpec[] = [
      { type: 'normal', id: 'unpin', label: 'Unpin' },
      { type: 'normal', id: 'duplicate', label: 'Duplicar' },
      { type: 'normal', id: 'close', label: 'Cerrar' },
    ];
    void showContextMenu(items, {
      unpin: () => void window.api.tab.unpin({ id: node.id }),
      duplicate: () =>
        void window.api.window.openUrlInNewTab({
          url: node.url,
          parentId: null,
          activate: true,
        }),
      close: () => closeTab(node.id),
    });
  }

  return (
    <div
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      onClick={() => void activateTab(node.id)}
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
      <div
        ref={before.setNodeRef}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: '50%',
        }}
        aria-hidden
      />
      <div
        ref={after.setNodeRef}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: 0,
          width: '50%',
        }}
        aria-hidden
      />
      <Favicon
        src={node.favicon}
        alt={title}
        size={20}
        fallbackChar={title.charAt(0) || '·'}
      />
      {dropZone === 'before' && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 4,
            bottom: 4,
            left: -2,
            width: 2,
            borderRadius: 2,
            background: 'var(--vela-drop-line)',
          }}
        />
      )}
      {dropZone === 'after' && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 4,
            bottom: 4,
            right: -2,
            width: 2,
            borderRadius: 2,
            background: 'var(--vela-drop-line)',
          }}
        />
      )}
    </div>
  );
}

export function PinnedTabs({
  workspaceId,
  mode,
  activeDrop,
}: PinnedTabsProps) {
  const pinned = useTreeStore((s) => selectPinnedTabs(s, workspaceId));
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabId = useRuntimeStore((s) =>
    currentWindowId !== null
      ? (s.activeTabIdByWindow[currentWindowId] ?? null)
      : null,
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
  const draggedKind = (dnd.active?.data.current as { kind?: string } | null)
    ?.kind;
  const draggedIsTab = draggedKind === 'tab';

  const isPinnedTarget =
    activeDrop?.targetId === PINNED_TARGET_ID && !activeDrop.invalid;

  const compact = mode === 'compact';

  if (pinned.length === 0) {
    if (!isDragging || !draggedIsTab) return null;
    return (
      <div
        ref={sectionDrop.setNodeRef}
        className="shrink-0 border-b px-1.5 py-2 text-center text-[11px] text-[var(--vela-fg-muted)]"
        style={{
          borderColor: 'var(--vela-border)',
          background: isPinnedTarget ? 'var(--vela-drop-bg)' : undefined,
          outline: isPinnedTarget
            ? '1px dashed var(--vela-drop-line)'
            : undefined,
          minHeight: 32,
        }}
        aria-label="Pestañas ancladas (vacío)"
      >
        Soltar para anclar
      </div>
    );
  }

  return (
    <div
      ref={sectionDrop.setNodeRef}
      className="flex shrink-0 gap-1 overflow-x-auto border-b px-1.5 py-2"
      style={{
        borderColor: 'var(--vela-border)',
        flexWrap: compact ? 'wrap' : 'nowrap',
        justifyContent: compact ? 'center' : undefined,
        background: isPinnedTarget ? 'var(--vela-drop-bg)' : undefined,
        outline: isPinnedTarget
          ? '1px dashed var(--vela-drop-line)'
          : undefined,
        outlineOffset: -1,
      }}
      role="list"
      aria-label="Pestañas ancladas"
    >
      {pinned.map((node) => (
        <PinnedTab
          key={node.id}
          node={node as TabNode}
          isActive={node.id === activeTabId}
          activeDrop={activeDrop}
        />
      ))}
    </div>
  );
}

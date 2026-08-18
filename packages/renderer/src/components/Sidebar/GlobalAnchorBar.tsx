import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { generateKeyBetween } from 'fractional-indexing';
import { useCallback, useState } from 'react';
import type { CSSProperties } from 'react';
import type { MenuItemSpec, TabNode } from '@vela/shared';
import { useTreeStore } from '../../stores/treeStore';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { showContextMenu } from '../../lib/contextMenu';
import { writeToClipboard } from '../../lib/clipboard';
import { toast } from '../../stores/toastStore';
import { Favicon } from './Favicon';
import { ANCHOR_TARGET_ID, encodeDroppableId } from './dropValidation';
import type { ActiveDrop } from './types';

interface AnchorItemProps {
  node: TabNode;
  isActive: boolean;
  isDragTarget: { zone: 'before' | 'after' } | null;
}

function AnchorItem({ node, isActive, isDragTarget }: AnchorItemProps) {
  const reorderNode = useTreeStore((s) => s.reorderNode);
  const activateTab = useRuntimeStore((s) => s.activateTab);

  const drag = useDraggable({
    id: node.id,
    data: { kind: 'global-anchor', anchorId: node.id },
  });

  const before = useDroppable({
    id: `anchor-before-${node.id}`,
    data: { anchorId: node.id, zone: 'before' as const },
  });

  const after = useDroppable({
    id: `anchor-after-${node.id}`,
    data: { anchorId: node.id, zone: 'after' as const },
  });

  const hasDrift = node.anchoredUrl !== null && node.url !== node.anchoredUrl;
  const title = node.name || node.originalTitle || node.url;
  const tooltip = title ? `${title}\n${node.url}` : node.url;
  const transformStyle: CSSProperties = drag.transform
    ? { transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` }
    : {};

  function handleClick() {
    void activateTab(node.id);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const items: MenuItemSpec[] = [
      ...(node.anchoredUrl !== null
        ? [
          { type: 'normal' as const, id: 'restore-anchor', label: 'Restaurar Ancla' },
          { type: 'normal' as const, id: 'replace-anchor', label: 'Reemplazar Ancla' },
          { type: 'separator' as const },
        ]
        : []),
      { type: 'normal' as const, id: 'rename', label: 'Renombrar' },
      { type: 'normal' as const, id: 'copy-url', label: 'Copiar enlace' },
      { type: 'normal' as const, id: 'duplicate', label: 'Duplicar' },
      { type: 'separator' as const },
      { type: 'normal' as const, id: 'remove', label: 'Levar Ancla' },
    ];
    void showContextMenu(items, {
      'restore-anchor': () => void window.api.tab.restoreAnchoredUrl({ id: node.id }),
      'replace-anchor': () => void window.api.tab.replaceAnchoredUrl({ id: node.id }),
      'copy-url': () => {
        void writeToClipboard(node.url).then(() => {
          toast('Enlace copiado al portapapeles', 'success');
        });
      },
      duplicate: () =>
        void window.api.window.openUrlInNewTab({
          url: node.url,
          parentId: null,
          activate: true,
        }),
      rename: async () => {
        const currentTitle = node.name || node.originalTitle || '';
        const newTitle = prompt('Nuevo nombre:', currentTitle);
        if (newTitle !== null && newTitle !== currentTitle) {
          await window.api.node.rename({ id: node.id, name: newTitle });
        }
      },
      remove: () => void window.api.tab.unanchor({ id: node.id }),
    });
  }

  const fallbackChar = (title || node.url).charAt(0) || '·';

  return (
    <div
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      role="button"
      tabIndex={0}
      title={tooltip}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => { if (e.key === 'Enter') handleClick(); }}
      className="relative flex shrink-0 cursor-default items-center justify-center rounded-md hover:bg-[var(--vela-bg-row-hover)]"
      style={{
        width: 32,
        height: 32,
        opacity: drag.isDragging ? 0.4 : 1,
        background: isActive ? 'var(--vela-tab-active-bg)' : undefined,
        outline: isActive ? '1px solid var(--vela-accent)' : undefined,
        outlineOffset: -1,
        ...transformStyle,
      }}
    >
      <div ref={before.setNodeRef} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%' }} aria-hidden />
      <div ref={after.setNodeRef} style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '50%' }} aria-hidden />
      <Favicon src={node.favicon} alt={title || node.url} size={20} fallbackChar={fallbackChar} />
      {hasDrift && (
        <span
          aria-hidden
          title="El Ancla ha navegado fuera de su URL original"
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
      {isDragTarget?.zone === 'before' && (
        <span aria-hidden style={{ position: 'absolute', top: 4, bottom: 4, left: -2, width: 2, borderRadius: 2, background: 'var(--vela-drop-line)' }} />
      )}
      {isDragTarget?.zone === 'after' && (
        <span aria-hidden style={{ position: 'absolute', top: 4, bottom: 4, right: -2, width: 2, borderRadius: 2, background: 'var(--vela-drop-line)' }} />
      )}
    </div>
  );
}

interface GlobalAnchorBarProps {
  activeDrop: ActiveDrop | null;
}

export function GlobalAnchorBar({ activeDrop }: GlobalAnchorBarProps) {
  const anchoredTabs = useTreeStore((s) => s.anchoredTabs);
  const reorderNode = useTreeStore((s) => s.reorderNode);
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabIdByWindow = useRuntimeStore((s) => s.activeTabIdByWindow);
  const activeTabId = currentWindowId !== null ? (activeTabIdByWindow[currentWindowId] ?? null) : null;

  const [dragTarget, setDragTarget] = useState<{ id: string; zone: 'before' | 'after' } | null>(null);

  const sectionDrop = useDroppable({
    id: encodeDroppableId(ANCHOR_TARGET_ID, 'inside'),
    data: { nodeId: ANCHOR_TARGET_ID, parentId: null, zone: 'inside' as const },
  });

  const outerDnd = useDndContext();
  const draggedKind = (outerDnd.active?.data.current as { kind?: string } | null)?.kind;
  const isDraggingTab = draggedKind === 'tab';
  const isAnchorTarget = activeDrop?.targetId === ANCHOR_TARGET_ID && !activeDrop.invalid;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragTarget(null);
      if (!event.over) return;
      const draggedId = String(event.active.id);
      const overData = event.over.data.current as { anchorId?: string; zone?: 'before' | 'after' } | undefined;
      if (!overData?.anchorId || !overData.zone) return;
      if (draggedId === overData.anchorId) return;

      const sorted = [...anchoredTabs].sort((a, b) => (a.position < b.position ? -1 : 1));
      const targetIdx = sorted.findIndex((n) => n.id === overData.anchorId);
      if (targetIdx === -1) return;
      const targetNode = sorted[targetIdx];
      if (!targetNode) return;

      const insertBefore = overData.zone === 'before';
      const prevPos = insertBefore
        ? (sorted[targetIdx - 1]?.position ?? null)
        : targetNode.position;
      const nextPos = insertBefore
        ? targetNode.position
        : (sorted[targetIdx + 1]?.position ?? null);
      const newPosition = generateKeyBetween(prevPos, nextPos);
      void reorderNode({ id: draggedId, newPosition });
    },
    [anchoredTabs, reorderNode],
  );

  if (anchoredTabs.length === 0) {
    if (!isDraggingTab) return null;
    return (
      <div
        ref={sectionDrop.setNodeRef}
        className="shrink-0 border-b px-1.5 py-2 text-center text-[11px] text-[var(--vela-fg-muted)]"
        style={{
          borderColor: 'var(--vela-border)',
          background: isAnchorTarget ? 'var(--vela-drop-bg)' : undefined,
          outline: isAnchorTarget ? '1px dashed var(--vela-drop-line)' : undefined,
          minHeight: 32,
        }}
        aria-label="Anclas (vacío)"
      >
        Soltar para anclar
      </div>
    );
  }

  const sorted = [...anchoredTabs].sort((a, b) => (a.position < b.position ? -1 : 1));

  return (
    <div
      ref={sectionDrop.setNodeRef}
      style={{
        background: isAnchorTarget ? 'var(--vela-drop-bg)' : 'rgba(0, 0, 0, 0.10)',
        borderBottom: '1px solid var(--vela-border)',
        boxShadow: 'inset 0 -1px 0 color-mix(in srgb, var(--vela-accent) 12%, transparent)',
        outline: isAnchorTarget ? '1px dashed var(--vela-drop-line)' : undefined,
        outlineOffset: -1,
      }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => {
          if (!e.over) { setDragTarget(null); return; }
          const d = e.over.data.current as { anchorId?: string; zone?: 'before' | 'after' } | undefined;
          if (d?.anchorId && d.zone) setDragTarget({ id: d.anchorId, zone: d.zone });
          else setDragTarget(null);
        }}
        onDragCancel={() => setDragTarget(null)}
      >
        <div
          className="flex flex-wrap gap-1 px-2 py-1.5"
          style={{ minHeight: 40 }}
          role="list"
          aria-label="Anclas"
        >
          {sorted.map((node) => (
            <AnchorItem
              key={node.id}
              node={node}
              isActive={node.id === activeTabId}
              isDragTarget={dragTarget?.id === node.id ? { zone: dragTarget.zone } : null}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

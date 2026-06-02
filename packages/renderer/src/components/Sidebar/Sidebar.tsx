import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { TreeNode, TabNode } from '@vela/shared';
import { useUiStore, SIDEBAR_WIDTH_COMPACT } from '../../stores/uiStore';
import { useTreeStore } from '../../stores/treeStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';
import { toast } from '../../stores/toastStore';
import { call } from '../../lib/ipc';
import { useAddressBarStore } from '../../stores/addressBarStore';
import { FavoritesBar } from './FavoritesBar';
import { GlobalAnchorBar } from './GlobalAnchorBar';
import { SidebarFooter } from './SidebarFooter';
import { TreeView } from './TreeView';
import { WorkspaceHeader } from './WorkspaceHeader';
import {
  decodeDroppableId,
  isDropValid,
  PINNED_TARGET_ID,
  ANCHOR_TARGET_ID,
  type DropZone,
} from './dropValidation';
import { resolveDropPosition } from './dropPosition';
import type { ActiveDrop } from './types';
import type { NodeDropData } from './useNodeDrop';

export function Sidebar() {
  const sidebarMode = useUiStore((s) => s.sidebarMode);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarWidthNormal = useUiStore((s) => s.sidebarWidthNormal);
  const newtabButtonPos = useUiStore((s) => s.newtabButtonPos);
  const setSidebarWidthNormal = useUiStore((s) => s.setSidebarWidthNormal);
  const persistSidebarWidth = useUiStore((s) => s.persistSidebarWidth);
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);
  const moveNode = useTreeStore((s) => s.moveNode);
  const reorderNode = useTreeStore((s) => s.reorderNode);

  const [activeDrop, setActiveDrop] = useState<ActiveDrop | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const onNewTab = useCallback((): void => {
    void call(() =>
      window.api.window.openUrlInNewTab({
        url: 'vela://newtab',
        parentId: null,
        activate: true,
      }),
    ).then(() => {
      setTimeout(() => useAddressBarStore.getState().requestFocus(), 0);
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const compact = sidebarMode === 'compact';
  const widthPx = compact ? SIDEBAR_WIDTH_COMPACT : sidebarWidthNormal;

  const widthRef = useRef(sidebarWidthNormal);
  widthRef.current = sidebarWidthNormal;

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.current;
      function onMouseMove(ev: MouseEvent) {
        setSidebarWidthNormal(startWidth + (ev.clientX - startX));
      }
      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        void persistSidebarWidth();
      }
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [setSidebarWidthNormal, persistSidebarWidth],
  );

  const allNodes = useTreeStore((s) =>
    activeWorkspaceId ? (s.nodesByWorkspace[activeWorkspaceId] ?? []) : [],
  );
  const byId = useMemo(
    () => new Map<string, TreeNode>(allNodes.map((n) => [n.id, n])),
    [allNodes],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggedId(String(event.active.id));
    setActiveDrop(null);
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const draggedIdNow = draggedId ?? String(event.active.id);
      if (!event.over) { setActiveDrop(null); return; }

      const overId = String(event.over.id);
      const data = event.over.data.current as NodeDropData | undefined;
      if (!data) { setActiveDrop(null); return; }
      const decoded = decodeDroppableId(overId);
      if (!decoded) { setActiveDrop(null); return; }
      const invalid = !isDropValid(
        draggedIdNow,
        {
          parentId: decoded.zone === 'inside' ? data.nodeId : data.parentId,
          nodeId: data.nodeId,
          zone: decoded.zone,
        },
        byId,
      );
      setActiveDrop({
        draggedId: draggedIdNow,
        targetId: data.nodeId,
        zone: decoded.zone as DropZone,
        invalid,
      });
    },
    [byId, draggedId],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const draggedIdNow = String(event.active.id);
      setDraggedId(null);
      const drop = activeDrop;
      setActiveDrop(null);

      if (!drop || drop.invalid || !event.over) return;

      const dragged = byId.get(draggedIdNow);
      if (!dragged) return;

      const targetNode =
        drop.targetId === PINNED_TARGET_ID
          ? null
          : (byId.get(drop.targetId) ?? null);

      const resolution = resolveDropPosition(
        draggedIdNow,
        {
          nodeId: drop.targetId,
          parentId: targetNode?.parentId ?? null,
          zone: drop.zone,
        },
        allNodes,
      );
      if (!resolution) return;

      const shouldPin =
        dragged.kind === 'tab' &&
        !(dragged as TabNode).pinned &&
        (drop.targetId === PINNED_TARGET_ID ||
          (targetNode?.kind === 'tab' && (targetNode as TabNode).pinned));

      const shouldAnchor =
        dragged.kind === 'tab' &&
        !(dragged as TabNode).anchored &&
        drop.targetId === ANCHOR_TARGET_ID;

      const shouldUnpin =
        dragged.kind === 'tab' &&
        (dragged as TabNode).pinned &&
        drop.targetId !== PINNED_TARGET_ID &&
        !(targetNode?.kind === 'tab' && (targetNode as TabNode).pinned);

      const positionPromise =
        resolution.newParentId === dragged.parentId
          ? reorderNode({ id: draggedIdNow, newPosition: resolution.newPosition })
          : moveNode({ id: draggedIdNow, newParentId: resolution.newParentId, newPosition: resolution.newPosition });

      if (shouldAnchor) {
        void positionPromise.then(() => window.api.tab.anchor({ id: draggedIdNow }));
      } else if (shouldPin) {
        void positionPromise.then(() => window.api.tab.pin({ id: draggedIdNow }));
      } else if (shouldUnpin) {
        void positionPromise.then(() => window.api.tab.unpin({ id: draggedIdNow }));
      } else {
        void positionPromise;
      }
    },
    [activeDrop, allNodes, byId, moveNode, reorderNode],
  );


  if (!sidebarOpen) return null;

  return (
    <aside
      className="flex h-full shrink-0 flex-col"
      style={{
        position: 'relative',
        width: widthPx,
        background: 'color-mix(in srgb, var(--vela-bg-sidebar) calc(var(--sidebar-background-opacity, 1) * 100%), transparent)',
        backdropFilter: 'var(--sidebar-backdrop-filter, none)',
        WebkitBackdropFilter: 'var(--sidebar-backdrop-filter, none)',
        borderRight: '1px solid var(--vela-border)',
      }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => { setDraggedId(null); setActiveDrop(null); }}
      >
        <GlobalAnchorBar activeDrop={activeDrop} />
        {!window.api.init.isBlindedWindow && <WorkspaceHeader />}
        {activeWorkspaceId ? (
          <>
            <FavoritesBar
              workspaceId={activeWorkspaceId}
              activeDrop={activeDrop}
            />
            {newtabButtonPos === 'above-tabs' && (
              <div style={{ padding: compact ? '4px' : '4px 8px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={onNewTab}
                  title="Nueva pestaña"
                  aria-label="Nueva pestaña"
                  className="hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: compact ? 32 : '100%',
                    height: 28,
                    padding: compact ? 0 : '0 4px',
                    borderRadius: 6,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--vela-fg-muted)',
                    cursor: 'pointer',
                    fontSize: 13,
                    justifyContent: compact ? 'center' : 'flex-start',
                    margin: compact ? '0 auto' : undefined,
                  }}
                >
                  <Plus size={14} style={{ flexShrink: 0 }} />
                  {!compact && <span style={{ fontSize: 11 }}>Nueva pestaña</span>}
                </button>
              </div>
            )}
            <TreeView
              workspaceId={activeWorkspaceId}
              mode={sidebarMode}
              activeDrop={activeDrop}
            />
            <SidebarFooter mode={sidebarMode} onNewTab={onNewTab} />
          </>
        ) : (
          <div className="flex-1 px-3 py-4 text-sm text-[var(--vela-fg-muted)]">
            Selecciona un workspace para empezar.
          </div>
        )}
      </DndContext>

      {!compact && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: 4,
            cursor: 'col-resize',
            zIndex: 10,
          }}
          onMouseDown={handleResizeMouseDown}
        />
      )}
    </aside>
  );
}

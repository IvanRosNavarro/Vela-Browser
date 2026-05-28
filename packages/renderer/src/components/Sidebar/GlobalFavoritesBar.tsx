import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { generateKeyBetween } from 'fractional-indexing';
import { useCallback, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Favorite, MenuItemSpec } from '@vela/shared';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';
import { useTreeStore } from '../../stores/treeStore';
import { showContextMenu } from '../../lib/contextMenu';
import { Favicon } from './Favicon';

export const GLOBAL_FAVORITES_TARGET = '__global_favorites_bar__';

// ─── Workspace-open indicator ───────────────────────────────────────────────

function useUrlOpenStatus(url: string | null): 'active-workspace' | 'other-workspace' | 'none' {
  const nodesByWorkspace = useTreeStore((s) => s.nodesByWorkspace);
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);

  if (!url) return 'none';
  for (const [wsId, nodes] of Object.entries(nodesByWorkspace)) {
    for (const node of nodes) {
      if (node.kind === 'tab' && node.url === url) {
        return wsId === activeWorkspaceId ? 'active-workspace' : 'other-workspace';
      }
    }
  }
  return 'none';
}

// ─── Single favorite item ─────────────────────────────────────────────────────

interface FavItemProps {
  fav: Favorite;
  isDragTarget: { zone: 'before' | 'after' } | null;
}

function FavItem({ fav, isDragTarget }: FavItemProps) {
  const openStatus = useUrlOpenStatus(fav.url);
  const nodesByWorkspace = useTreeStore((s) => s.nodesByWorkspace);
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);
  const activateTab = useRuntimeStore((s) => s.activateTab);
  const remove = useFavoritesStore((s) => s.remove);
  const updateTitle = useFavoritesStore((s) => s.updateTitle);

  const drag = useDraggable({
    id: fav.id,
    data: { kind: 'global-favorite', favoriteId: fav.id },
  });

  const before = useDroppable({
    id: `gfav-before-${fav.id}`,
    data: { favoriteId: fav.id, zone: 'before' },
  });

  const after = useDroppable({
    id: `gfav-after-${fav.id}`,
    data: { favoriteId: fav.id, zone: 'after' },
  });

  const tooltip = fav.title ? `${fav.title}${fav.url ? `\n${fav.url}` : ''}` : (fav.url ?? '');
  const transformStyle: CSSProperties = drag.transform
    ? { transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)` }
    : {};

  function handleClick() {
    if (!fav.url) return;
    const nodes = activeWorkspaceId ? (nodesByWorkspace[activeWorkspaceId] ?? []) : [];
    const tab = nodes.find((n) => n.kind === 'tab' && n.url === fav.url);
    if (tab) {
      void activateTab(tab.id);
    } else {
      void window.api.window.openUrlInNewTab({ url: fav.url });
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const items: MenuItemSpec[] = [
      { type: 'normal', id: 'open-new-tab', label: 'Abrir en nueva pestaña' },
      { type: 'normal', id: 'open-new-ws', label: 'Abrir en nuevo workspace' },
      { type: 'separator' },
      { type: 'normal', id: 'rename', label: 'Renombrar' },
      { type: 'separator' },
      { type: 'normal', id: 'remove', label: 'Eliminar de Favorites' },
    ];
    void showContextMenu(items, {
      'open-new-tab': () => { if (fav.url) void window.api.window.openUrlInNewTab({ url: fav.url }); },
      'open-new-ws': async () => {
        if (!fav.url) return;
        const ws = await window.api.workspaces.create({ name: fav.title || new URL(fav.url).hostname });
        if (ws.ok) {
          await window.api.workspaces.setActive({ id: ws.data.id });
          void window.api.window.openUrlInNewTab({ url: fav.url });
        }
      },
      rename: async () => {
        const newTitle = prompt('Nuevo nombre:', fav.title);
        if (newTitle !== null && newTitle !== fav.title) {
          await updateTitle(fav.id, newTitle);
        }
      },
      remove: () => void remove(fav.id),
    });
  }

  const dot =
    openStatus === 'active-workspace'
      ? 'var(--vela-accent)'
      : openStatus === 'other-workspace'
        ? 'var(--vela-fg-muted)'
        : null;

  return (
    <>
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
        style={{ width: 32, height: 32, opacity: drag.isDragging ? 0.4 : 1, ...transformStyle }}
      >
        <div ref={before.setNodeRef} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '50%' }} aria-hidden />
        <div ref={after.setNodeRef} style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: '50%' }} aria-hidden />
        <Favicon src={fav.favicon} alt={fav.title || fav.url || ''} size={20} fallbackChar={(fav.title || fav.url || '?').charAt(0)} />
        {dot && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              bottom: 3,
              right: 3,
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: dot,
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

    </>
  );
}

// ─── Bar drop zone (for receiving tab-drags from tree) ───────────────────────

export function GlobalFavoritesBarDropZone() {
  const drop = useDroppable({
    id: GLOBAL_FAVORITES_TARGET,
    data: { kind: 'favorites-bar' },
  });
  return (
    <div
      ref={drop.setNodeRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      aria-hidden
    />
  );
}

// ─── Main bar ────────────────────────────────────────────────────────────────

export function GlobalFavoritesBar({ isExternalDragOver }: { isExternalDragOver: boolean }) {
  const favorites = useFavoritesStore((s) => s.favorites);
  const reorder = useFavoritesStore((s) => s.reorder);
  const [dragTarget, setDragTarget] = useState<{ id: string; zone: 'before' | 'after' } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragTarget(null);
      if (!event.over) return;
      const draggedId = String(event.active.id);
      const overData = event.over.data.current as { favoriteId?: string; zone?: 'before' | 'after' } | undefined;
      if (!overData?.favoriteId || !overData.zone) return;
      if (draggedId === overData.favoriteId) return;

      const sorted = [...favorites].sort((a, b) => a.position < b.position ? -1 : 1);
      const targetIdx = sorted.findIndex((f) => f.id === overData.favoriteId);
      if (targetIdx === -1) return;
      const targetFav = sorted[targetIdx];
      if (!targetFav) return;

      const insertBefore = overData.zone === 'before';
      const prevPos = insertBefore
        ? (sorted[targetIdx - 1]?.position ?? null)
        : targetFav.position;
      const nextPos = insertBefore
        ? targetFav.position
        : (sorted[targetIdx + 1]?.position ?? null);
      const newPosition = generateKeyBetween(prevPos, nextPos);
      void reorder(draggedId, newPosition);
    },
    [favorites, reorder],
  );

  if (favorites.length === 0 && !isExternalDragOver) return null;

  const sorted = [...favorites].sort((a, b) => a.position < b.position ? -1 : 1);

  return (
    <div
      className="relative shrink-0"
      style={{
        borderBottom: '1px solid var(--vela-border)',
        background: isExternalDragOver ? 'color-mix(in srgb, var(--vela-accent) 15%, transparent)' : undefined,
        outline: isExternalDragOver ? '1px dashed var(--vela-drop-line)' : undefined,
        outlineOffset: -1,
        transition: 'background 150ms',
      }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => {
          if (!e.over) { setDragTarget(null); return; }
          const d = e.over.data.current as { favoriteId?: string; zone?: 'before' | 'after' } | undefined;
          if (d?.favoriteId && d.zone) setDragTarget({ id: d.favoriteId, zone: d.zone });
          else setDragTarget(null);
        }}
        onDragCancel={() => setDragTarget(null)}
      >
        <div
          className="flex flex-wrap gap-1 px-1.5 py-2"
          style={{ minHeight: 40 }}
          role="list"
          aria-label="Favoritos globales"
        >
          {sorted.map((fav) => (
            <FavItem
              key={fav.id}
              fav={fav}
              isDragTarget={dragTarget?.id === fav.id ? { zone: dragTarget.zone } : null}
            />
          ))}
        </div>
      </DndContext>
      {/* Drop zone registered in OUTER DndContext so tree tabs can be dropped here */}
      <GlobalFavoritesBarDropZone />
    </div>
  );
}

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { generateKeyBetween } from 'fractional-indexing';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Workspace } from '@vela/shared';
import {
  useWorkspaceModalStore,
  useWorkspacesStore,
} from '../../stores';
import { useOverlay } from '../../lib/useOverlay';
import { call } from '../../lib/ipc';
import { WorkspaceIcon } from './WorkspaceIcon';

export interface WorkspaceDropdownProps {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement>;
}

export function WorkspaceDropdown({
  open,
  onClose,
  triggerRef,
}: WorkspaceDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  useOverlay(open);
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const activeId = useWorkspacesStore((s) => s.activeWorkspaceId);
  const setActive = useWorkspacesStore((s) => s.setActive);
  const reorder = useWorkspacesStore((s) => s.reorder);
  const reload = useWorkspacesStore((s) => s.reload);
  const openCreate = useWorkspaceModalStore((s) => s.openCreate);
  const openManage = useWorkspaceModalStore((s) => s.openManage);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent): void => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, triggerRef]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const sortedItems = useMemo(
    () => [...workspaces].sort((a, b) => (a.position < b.position ? -1 : 1)),
    [workspaces],
  );
  const itemIds = useMemo(() => sortedItems.map((w) => w.id), [sortedItems]);

  const handleDragEnd = async (event: DragEndEvent): Promise<void> => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedItems.findIndex((w) => w.id === active.id);
    const newIndex = sortedItems.findIndex((w) => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(sortedItems, oldIndex, newIndex);
    const moved = next[newIndex];
    if (!moved) return;
    const before = next[newIndex - 1]?.position ?? null;
    const after = next[newIndex + 1]?.position ?? null;
    let newPosition: string;
    try {
      newPosition = generateKeyBetween(before, after);
    } catch {
      return;
    }
    await reorder({ id: moved.id, newPosition });
    await reload();
  };

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="menu"
      className="absolute left-0 top-full z-30 mt-1 min-w-[260px] rounded-md py-1 text-[13px] shadow-2xl"
      style={{
        background: 'var(--vela-bg-sidebar-elev)',
        border: '1px solid var(--vela-border)',
      }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e) => void handleDragEnd(e)}
      >
        <SortableContext
          items={itemIds}
          strategy={verticalListSortingStrategy}
        >
          {sortedItems.map((ws, idx) => (
            <DropdownItem
              key={ws.id}
              ws={ws}
              index={idx}
              active={ws.id === activeId}
              onActivate={async () => {
                onClose();
                if (ws.id === activeId) return;
                await setActive(ws.id);
              }}
            />
          ))}
        </SortableContext>
      </DndContext>

      {sortedItems.length === 0 && (
        <div className="px-3 py-2 text-[12px] text-[var(--vela-fg-muted)]">
          No hay workspaces.
        </div>
      )}

      <div
        className="my-1 border-t"
        style={{ borderColor: 'var(--vela-border)' }}
      />
      <button
        type="button"
        onClick={() => {
          onClose();
          void openCreate();
        }}
        className="block w-full px-3 py-1.5 text-left text-[var(--vela-fg)] hover:bg-[var(--vela-bg-row-hover)]"
      >
        + Nuevo workspace
      </button>
      <button
        type="button"
        onClick={() => {
          onClose();
          void openManage();
        }}
        className="block w-full px-3 py-1.5 text-left text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
      >
        Gestionar workspaces
      </button>
    </div>
  );
}

interface DropdownItemProps {
  ws: Workspace;
  index: number;
  active: boolean;
  onActivate: () => Promise<void>;
}

function DropdownItem({ ws, index, active, onActivate }: DropdownItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ws.id });
  const [isWsWhitelisted, setIsWsWhitelisted] = useState(false);

  useEffect(() => {
    void window.api.settings.get({ key: 'tabs:discard-workspace-whitelists' }).then((res) => {
      if (!res.ok) return;
      try {
        const map = (res.data.value ?? {}) as Record<string, boolean>;
        setIsWsWhitelisted(!!map[ws.id]);
      } catch { /* ignore */ }
    }).catch(() => {});
  }, [ws.id]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    position: 'relative',
  };

  const toggleWhitelist = (): void => {
    void call(() => window.api.discard.toggleWorkspaceWhitelist({ workspaceId: ws.id })).then((res) => {
      setIsWsWhitelisted(res.whitelisted);
    });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 pl-2 pr-2"
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1 bottom-1 w-[2px] rounded"
          style={{ background: 'var(--vela-accent)' }}
        />
      )}
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Arrastra para reordenar"
        className="flex h-6 w-4 shrink-0 cursor-grab items-center justify-center text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)] active:cursor-grabbing"
      >
        ⋮⋮
      </button>
      <button
        type="button"
        onClick={() => void onActivate()}
        className="flex flex-1 items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-[var(--vela-bg-row-hover)]"
        style={{
          color: active ? 'var(--vela-fg)' : 'var(--vela-fg)',
        }}
      >
        <WorkspaceIcon
          icon={ws.icon}
          fallbackName={ws.name}
          background={ws.color}
          size={20}
        />
        <span className="flex-1 truncate">{ws.name}</span>
        {index < 9 && (
          <kbd
            className="rounded border px-1 text-[10px] text-[var(--vela-fg-muted)]"
            style={{ borderColor: 'var(--vela-border)' }}
          >
            Ctrl+{index + 1}
          </kbd>
        )}
      </button>
      <button
        type="button"
        onClick={toggleWhitelist}
        title={isWsWhitelisted ? 'Pestañas protegidas de suspensión' : 'No suspender pestañas de este workspace'}
        aria-label={isWsWhitelisted ? 'Desactivar protección de suspensión' : 'Proteger pestañas de suspensión'}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] hover:bg-[var(--vela-bg-row-hover)]"
        style={{ color: isWsWhitelisted ? 'var(--vela-accent)' : 'var(--vela-fg-muted)' }}
      >
        {isWsWhitelisted ? '🛡' : '⏸'}
      </button>
    </div>
  );
}

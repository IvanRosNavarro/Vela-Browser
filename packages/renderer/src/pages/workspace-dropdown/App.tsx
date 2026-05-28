import { useCallback, useEffect, useMemo, useState } from 'react';
import { getGlassStyle } from '../../lib/popupGlass';
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
import type { Workspace } from '@vela/shared';

const params = new URLSearchParams(window.location.search);
const parentWindowId = parseInt(params.get('windowId') ?? '0', 10);

function WorkspaceIcon({ icon, fallbackName, background, size }: {
  icon?: string | null;
  fallbackName: string;
  background?: string | null;
  size: number;
}) {
  const initial = fallbackName.charAt(0).toUpperCase();
  const bg = background ?? '#5b8ef4';

  if (icon) {
    return (
      <span
        style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.65, flexShrink: 0 }}
        role="img"
        aria-label={fallbackName}
      >
        {icon}
      </span>
    );
  }

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.5,
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {initial}
    </span>
  );
}

interface DropdownItemProps {
  ws: Workspace;
  index: number;
  active: boolean;
  onActivate: () => void;
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
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
    paddingRight: 8,
    cursor: 'default',
  };

  const toggleWhitelist = (): void => {
    void window.api.discard.toggleWorkspaceWhitelist({ workspaceId: ws.id }).then((res) => {
      if (res.ok) setIsWsWhitelisted((res.data as { whitelisted: boolean }).whitelisted);
    });
  };

  const accentBar: React.CSSProperties = active ? {
    position: 'absolute',
    left: 0,
    top: 4,
    bottom: 4,
    width: 2,
    borderRadius: 2,
    background: 'var(--vela-accent)',
  } : {};

  return (
    <div ref={setNodeRef} style={style}>
      {active && <span aria-hidden style={accentBar} />}
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Arrastra para reordenar"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 24, flexShrink: 0, background: 'none', border: 'none',
          color: 'var(--vela-fg-muted)', cursor: 'grab', padding: 0, fontSize: 11,
        }}
      >
        ⋮⋮
      </button>
      <button
        type="button"
        onClick={onActivate}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          borderRadius: 4, padding: '4px 6px', background: 'none', border: 'none',
          color: 'var(--vela-fg)', cursor: 'pointer', textAlign: 'left', minWidth: 0,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
      >
        <WorkspaceIcon icon={ws.icon} fallbackName={ws.name} background={ws.color} size={20} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
          {ws.name}
        </span>
        {index < 9 && (
          <kbd style={{ fontSize: 10, color: 'var(--vela-fg-muted)', border: '1px solid var(--vela-border)', borderRadius: 3, padding: '0 3px' }}>
            Ctrl+{index + 1}
          </kbd>
        )}
      </button>
      <button
        type="button"
        onClick={toggleWhitelist}
        title={isWsWhitelisted ? 'Pestañas protegidas de suspensión' : 'Proteger pestañas de suspensión'}
        style={{
          width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', cursor: 'pointer', fontSize: 11,
          color: isWsWhitelisted ? 'var(--vela-accent)' : 'var(--vela-fg-muted)',
          borderRadius: 4,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
      >
        {isWsWhitelisted ? '🛡' : '⏸'}
      </button>
    </div>
  );
}

export function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      window.api.workspaces.list(),
      window.api.workspaces.getActive(),
    ]).then(([listRes, activeRes]) => {
      if (listRes.ok) setWorkspaces(listRes.data);
      if (activeRes.ok) setActiveId(activeRes.data?.id ?? null);
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const sortedItems = useMemo(
    () => [...workspaces].sort((a, b) => (a.position < b.position ? -1 : 1)),
    [workspaces],
  );
  const itemIds = useMemo(() => sortedItems.map((w) => w.id), [sortedItems]);

  const handleDragEnd = useCallback(async (event: DragEndEvent): Promise<void> => {
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
    setWorkspaces(next.map((w, i) => i === newIndex ? { ...w, position: newPosition } : w));
    await window.api.workspaces.reorder({ id: moved.id, newPosition });
    const listRes = await window.api.workspaces.list();
    if (listRes.ok) setWorkspaces(listRes.data);
  }, [sortedItems]);

  const handleActivate = useCallback(async (wsId: string): Promise<void> => {
    if (wsId === activeId) { window.close(); return; }
    await window.api.workspaces.setActive({ id: wsId, sourceWindowId: parentWindowId });
    window.close();
  }, [activeId]);

  const handleNewWorkspace = useCallback(async (): Promise<void> => {
    await window.api.workspaceDrop.triggerModal({ windowId: parentWindowId, mode: 'create' });
  }, []);

  const handleManage = useCallback(async (): Promise<void> => {
    await window.api.workspaceDrop.triggerModal({ windowId: parentWindowId, mode: 'manage' });
  }, []);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--vela-bg-surface, #1c1f26)',
    border: '1px solid var(--vela-border, rgba(255,255,255,0.09))',
    borderRadius: 8,
    overflow: 'hidden',
    paddingTop: 4,
    paddingBottom: 4,
    ...getGlassStyle(),
  };

  const btnRowStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '6px 12px',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    fontSize: 13,
    cursor: 'pointer',
    color: 'var(--vela-fg, #e6e8ee)',
  };

  const mutedBtnStyle: React.CSSProperties = {
    ...btnRowStyle,
    color: 'var(--vela-fg-muted, #8c93a3)',
  };

  return (
    <div style={containerStyle}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(e) => void handleDragEnd(e)}
      >
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {sortedItems.map((ws, idx) => (
            <DropdownItem
              key={ws.id}
              ws={ws}
              index={idx}
              active={ws.id === activeId}
              onActivate={() => void handleActivate(ws.id)}
            />
          ))}
        </SortableContext>
      </DndContext>

      {sortedItems.length === 0 && (
        <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--vela-fg-muted, #8c93a3)' }}>
          No hay workspaces.
        </div>
      )}

      <div style={{ height: 1, background: 'var(--vela-border, rgba(255,255,255,0.09))', margin: '4px 0' }} />
      <button
        type="button"
        style={btnRowStyle}
        onClick={() => void handleNewWorkspace()}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.06))'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
      >
        + Nuevo workspace
      </button>
      <button
        type="button"
        style={mutedBtnStyle}
        onClick={() => void handleManage()}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.06))'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
      >
        Gestionar workspaces
      </button>
    </div>
  );
}

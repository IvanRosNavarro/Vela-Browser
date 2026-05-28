import { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { URLBAR_ICON_LABELS, type UrlBarIconConfig, type UrlBarIconId } from '@vela/shared';
import { useUrlBarStore } from '../../../stores/urlBarStore';
import { useAparejosStore } from '../../../stores/aparejosStore';

function DragHandle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--vela-fg-muted)', flexShrink: 0 }}>
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--vela-accent)', flexShrink: 0 }}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      style={{
        width: 36, height: 20, borderRadius: 10, border: 'none', padding: '2px',
        background: value ? 'var(--vela-accent)' : 'var(--vela-border)',
        cursor: 'pointer', transition: 'background 200ms', flexShrink: 0,
        display: 'flex', alignItems: 'center',
      }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transform: value ? 'translateX(16px)' : 'translateX(0)',
        transition: 'transform 200ms',
      }} />
    </button>
  );
}

interface SortableRowProps {
  config: UrlBarIconConfig;
  arriado?: boolean;
  onToggleVisible: (id: UrlBarIconId, visible: boolean) => void;
}

function SortableRow({ config, arriado, onToggleVisible }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: config.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 6,
        border: '1px solid var(--vela-border)',
        background: 'var(--vela-bg-surface)',
        marginBottom: 4,
      }}
    >
      <div
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab', touchAction: 'none', flexShrink: 0 }}
      >
        <DragHandle />
      </div>

      <span style={{ flex: 1, fontSize: 12, color: 'var(--vela-fg)' }}>
        {URLBAR_ICON_LABELS[config.id]}
      </span>

      {arriado ? (
        <span style={{
          fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 4,
          background: 'var(--vela-bg-app)', color: 'var(--vela-fg-muted)',
          border: '1px solid var(--vela-border)', whiteSpace: 'nowrap',
        }}>
          Arriado
        </span>
      ) : (
        <Toggle
          value={config.visible}
          onChange={(v) => onToggleVisible(config.id, v)}
        />
      )}
    </div>
  );
}

export function UrlBarConfigurator() {
  const iconConfig = useUrlBarStore((s) => s.iconConfig);
  const setVisible = useUrlBarStore((s) => s.setVisible);
  const reorder = useUrlBarStore((s) => s.reorder);
  const isIzado = useAparejosStore((s) => s.isIzado);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const sorted = [...iconConfig].sort((a, b) => (a.position < b.position ? -1 : 1));
  const sortedIds = sorted.map((c) => c.id);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = sortedIds.indexOf(active.id as UrlBarIconId);
      const newIndex = sortedIds.indexOf(over.id as UrlBarIconId);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(sortedIds, oldIndex, newIndex);
      void reorder(reordered);
    },
    [sortedIds, reorder],
  );

  const isArriado = (id: UrlBarIconId) => {
    if (id === 'adblocker') return !isIzado('adblocker');
    if (id === 'cookie') return !isIzado('cookies');
    return false;
  };

  return (
    <div>
      {/* Fixed security indicator row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 6,
          border: '1px solid var(--vela-border)',
          background: 'var(--vela-bg-surface)',
          marginBottom: 4,
          opacity: 0.7,
        }}
      >
        <LockIcon />
        <span style={{ flex: 1, fontSize: 12, color: 'var(--vela-fg)' }}>
          Candado de seguridad
        </span>
        <span style={{ fontSize: 10, color: 'var(--vela-fg-muted)' }}>
          Siempre visible · No configurable
        </span>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortedIds} strategy={verticalListSortingStrategy}>
          {sorted.map((config) => (
            <SortableRow
              key={config.id}
              config={config}
              arriado={isArriado(config.id)}
              onToggleVisible={(id, visible) => void setVisible(id, visible)}
            />
          ))}
        </SortableContext>
      </DndContext>

      <p style={{ fontSize: 11, color: 'var(--vela-fg-muted)', marginTop: 8 }}>
        Arrastra para reordenar. Los cambios se aplican en tiempo real.
      </p>
    </div>
  );
}

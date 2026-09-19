import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { IcoChevronRight, IcoDrag, IcoGrid, IcoList, IcoPencil, IcoTrash } from './icons';
import { ItemEditor, miniBtn } from './ItemEditor';
import type {
  BreadcrumbEntry,
  CollectionDnd,
  CollectionEditResult,
  CollectionItem,
  CollectionViewMode,
} from './types';

// ─── piezas ───────────────────────────────────────────────────────────────────

export function FaviconImg({ src, fallback, size }: { src: string | null | undefined; fallback: string; size: number }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 4, flexShrink: 0,
        background: 'var(--vela-bg-folder-hover)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.floor(size * 0.6), fontWeight: 600,
        color: 'var(--vela-fg-muted)', textTransform: 'uppercase',
      }}>
        {fallback.charAt(0) || '·'}
      </div>
    );
  }
  return (
    <img src={src} alt="" width={size} height={size}
      style={{ borderRadius: 4, flexShrink: 0, objectFit: 'contain' }}
      onError={() => setErr(true)} draggable={false}
    />
  );
}

export const iconBtn = (active?: boolean): CSSProperties => ({
  padding: '5px 8px', borderRadius: 6, cursor: 'default',
  border: active ? '1px solid var(--vela-accent)' : '1px solid var(--vela-border)',
  background: active ? 'var(--vela-accent)' : 'var(--vela-bg-row-hover)',
  color: active ? '#fff' : 'var(--vela-fg)',
  display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, whiteSpace: 'nowrap',
});

function hostnameOf(url: string): string {
  try { return new URL(url).hostname || url; } catch { return url; }
}

const FOLDER_ENTRY_PREFIX = 'folder-entry-';

// Las zonas "entrar en carpeta" ganan a la reordenación cuando el puntero
// está encima de una carpeta.
const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  const folderEntries = pointer.filter((c) => String(c.id).startsWith(FOLDER_ENTRY_PREFIX));
  if (folderEntries.length > 0) return folderEntries;
  return closestCenter(args);
};

interface ItemProps {
  item: CollectionItem;
  editing: boolean;
  editUrl: boolean;
  allowEmptyName: boolean;
  draggable: boolean;
  isDropTarget: boolean;
  onOpen: (e: MouseEvent) => void;
  onStartEdit: () => void;
  onSave: (result: CollectionEditResult) => Promise<string | null>;
  onCancelEdit: () => void;
  onDelete: () => void;
  onContextMenu?: () => void;
}

/** Botones de la derecha: editar y, a su derecha, eliminar. */
function ItemActions({ item, visible, onStartEdit, onDelete, floating }: {
  item: CollectionItem;
  visible: boolean;
  onStartEdit: () => void;
  onDelete: () => void;
  floating?: boolean;
}) {
  const kindLabel = item.kind === 'folder' ? 'carpeta' : 'elemento';
  return (
    <div style={{
      display: 'flex', gap: 4, flexShrink: 0,
      visibility: visible ? 'visible' : 'hidden',
      ...(floating ? { position: 'absolute', top: 6, right: 6, zIndex: 3 } : {}),
    }}>
      <button
        type="button"
        title={`Editar ${kindLabel}`}
        aria-label={`Editar ${kindLabel}`}
        onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
        style={{ ...miniBtn(false), ...(floating ? { background: 'var(--vela-bg-surface)' } : {}) }}
      >
        <IcoPencil />
      </button>
      <button
        type="button"
        title={`Eliminar ${kindLabel}`}
        aria-label={`Eliminar ${kindLabel}`}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        style={{ ...miniBtn(false), ...(floating ? { background: 'var(--vela-bg-surface)' } : {}) }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--vela-insecure, #e05c5c)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--vela-fg)'; }}
      >
        <IcoTrash />
      </button>
    </div>
  );
}

function ListItem(props: ItemProps) {
  const { item, editing, draggable, isDropTarget } = props;
  const [hovered, setHovered] = useState(false);
  const sort = useSortable({ id: item.id, disabled: !draggable || editing });
  const folderEntry = useDroppable({ id: `${FOLDER_ENTRY_PREFIX}${item.id}`, disabled: !draggable || item.kind !== 'folder' });
  const isFolder = item.kind === 'folder';
  const markerColor = item.color ?? 'var(--vela-folder-marker-default)';

  return (
    <div
      ref={sort.setNodeRef}
      className="vela-collection-item"
      onClick={editing ? undefined : props.onOpen}
      onContextMenu={(e) => { if (!props.onContextMenu || editing) return; e.preventDefault(); props.onContextMenu(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: draggable ? '8px 20px 8px 6px' : '8px 20px', cursor: 'default',
        background: isDropTarget
          ? 'color-mix(in srgb, var(--vela-accent) 12%, transparent)'
          : hovered ? 'var(--vela-bg-row-hover)' : 'transparent',
        borderBottom: '1px solid var(--vela-border)',
        transform: CSS.Transform.toString(sort.transform),
        transition: [sort.transition, 'background 80ms'].filter(Boolean).join(', '),
        opacity: sort.isDragging ? 0.4 : 1,
        userSelect: 'none',
      }}
    >
      {draggable && (
        <div
          {...sort.listeners}
          {...sort.attributes}
          title="Arrastrar para mover"
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: 'grab', opacity: hovered && !editing ? 0.5 : 0, color: 'var(--vela-fg-muted)', padding: 2, display: 'flex', flexShrink: 0 }}
        >
          <IcoDrag />
        </div>
      )}

      <div ref={folderEntry.setNodeRef} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
        {isFolder ? (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, flexShrink: 0 }}>
            {item.icon ? (
              <span style={{ fontSize: 16, lineHeight: 1 }}>{item.icon}</span>
            ) : (
              <span style={{ width: 3, height: 14, borderRadius: 2, background: markerColor, display: 'block' }} />
            )}
          </span>
        ) : (
          <FaviconImg src={item.favicon} fallback={item.title} size={20} />
        )}

        {editing ? (
          <ItemEditor
            item={item}
            editUrl={props.editUrl}
            allowEmptyName={props.allowEmptyName}
            layout="row"
            fontSize={13}
            onSave={props.onSave}
            onCancel={props.onCancelEdit}
          />
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--vela-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.title}
            </div>
            <div style={{ fontSize: 11, color: 'var(--vela-fg-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isFolder ? 'Carpeta' : item.url}
              {item.hint ? ` · ${item.hint}` : ''}
            </div>
          </div>
        )}
      </div>

      {!editing && (
        <ItemActions item={item} visible={hovered} onStartEdit={props.onStartEdit} onDelete={props.onDelete} />
      )}

      {isFolder && !editing && (
        <span style={{ color: 'var(--vela-fg-muted)', flexShrink: 0, display: 'flex' }}><IcoChevronRight /></span>
      )}
    </div>
  );
}

function GridItem(props: ItemProps) {
  const { item, editing, draggable, isDropTarget } = props;
  const [hovered, setHovered] = useState(false);
  const sort = useSortable({ id: item.id, disabled: !draggable || editing });
  const folderEntry = useDroppable({ id: `${FOLDER_ENTRY_PREFIX}${item.id}`, disabled: !draggable || item.kind !== 'folder' });
  const isFolder = item.kind === 'folder';
  const markerColor = item.color ?? null;
  const highlighted = hovered || isDropTarget;

  return (
    <div
      ref={sort.setNodeRef}
      className="vela-collection-item"
      onClick={editing ? undefined : props.onOpen}
      onContextMenu={(e) => { if (!props.onContextMenu || editing) return; e.preventDefault(); props.onContextMenu(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', width: 152, borderRadius: 10,
        border: `1px solid ${isDropTarget ? 'var(--vela-accent)' : highlighted ? (markerColor ?? 'var(--vela-fg-muted)') : 'var(--vela-border)'}`,
        background: highlighted ? 'var(--vela-bg-row-hover)' : 'var(--vela-bg-surface)',
        boxShadow: highlighted ? '0 4px 16px rgba(0,0,0,0.18)' : '0 1px 4px rgba(0,0,0,0.08)',
        transform: CSS.Transform.toString(sort.transform) ?? (hovered ? 'translateY(-1px)' : 'none'),
        transition: [sort.transition, 'background 120ms', 'border-color 120ms', 'box-shadow 120ms'].filter(Boolean).join(', '),
        opacity: sort.isDragging ? 0.4 : 1,
        userSelect: 'none', overflow: 'hidden', cursor: 'default',
      }}
    >
      <div
        ref={folderEntry.setNodeRef}
        {...(draggable ? sort.listeners : {})}
        {...(draggable ? sort.attributes : {})}
        style={{
          height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '1px solid var(--vela-border)',
          background: markerColor
            ? `color-mix(in srgb, ${markerColor} 12%, var(--vela-bg-app))`
            : 'var(--vela-bg-app)',
        }}
      >
        {isFolder ? (
          <span style={{ fontSize: 34, lineHeight: 1, userSelect: 'none', filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.2))' }}>
            {item.icon ?? '📁'}
          </span>
        ) : (
          <FaviconImg src={item.favicon} fallback={item.title} size={36} />
        )}
      </div>

      {!editing && (
        <ItemActions item={item} visible={hovered} onStartEdit={props.onStartEdit} onDelete={props.onDelete} floating />
      )}

      <div style={{ padding: '9px 10px 8px' }}>
        {editing ? (
          <ItemEditor
            item={item}
            editUrl={props.editUrl}
            allowEmptyName={props.allowEmptyName}
            layout="stack"
            fontSize={12}
            onSave={props.onSave}
            onCancel={props.onCancelEdit}
          />
        ) : (
          <>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--vela-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.title}
            </div>
            <div style={{ fontSize: 10, color: 'var(--vela-fg-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isFolder ? 'Carpeta' : hostnameOf(item.url ?? '')}
              {item.hint ? ` · ${item.hint}` : ''}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── vista ────────────────────────────────────────────────────────────────────

export interface CollectionViewProps {
  /** Título de la cabecera (nombre de la carpeta o "Favoritos"). */
  title: string;
  titleIcon?: string | null;
  /** Color que tiñe la cabecera. */
  tint?: string | null;
  /** Si está, la cabecera muestra el lápiz para renombrar. */
  onRenameTitle?: (name: string) => Promise<void>;

  breadcrumb?: BreadcrumbEntry[];
  onNavigate?: (id: string | null) => void;

  query: string;
  onQueryChange: (q: string) => void;
  searchPlaceholder?: string;
  viewMode: CollectionViewMode;
  onViewModeChange: (mode: CollectionViewMode) => void;
  /** Botones extra de la barra (Nueva carpeta, Importar…). */
  toolbarExtra?: ReactNode;
  /** Contenido sobre la lista (p. ej. el campo de nueva carpeta). */
  topSlot?: ReactNode;

  items: CollectionItem[];
  emptyText: string;

  /** Permite editar la dirección de los enlaces además del nombre. */
  editUrl: boolean;
  /** Un nombre vacío restaura el nombre original (pestañas) en vez de fallar. */
  allowEmptyName: boolean;

  onOpen: (item: CollectionItem, e: MouseEvent) => void;
  /** Devuelve un mensaje de error para seguir editando, o null. */
  onSave: (item: CollectionItem, result: CollectionEditResult) => Promise<string | null>;
  onDelete: (item: CollectionItem) => void;
  onContextMenu?: (item: CollectionItem) => void;
  dnd?: CollectionDnd;
  /** Contenido flotante de la página (diálogos, toasts). */
  children?: ReactNode;
}

/**
 * Vista compartida por `vela://folder-view` y `vela://favorites`: cabecera con
 * renombrado, migas de pan, buscador, lista o cuadrícula, y edición y borrado
 * in situ de cada elemento. Una mejora aquí llega a las dos páginas.
 */
export function CollectionView(props: CollectionViewProps) {
  const {
    title, titleIcon, tint, onRenameTitle, breadcrumb, onNavigate,
    query, onQueryChange, viewMode, onViewModeChange, items, dnd,
  } = props;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overFolderId, setOverFolderId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const headerBg = tint
    ? `color-mix(in srgb, ${tint} 20%, var(--vela-bg-app))`
    : 'var(--vela-bg-app)';
  const showCrumbs = !!breadcrumb && breadcrumb.length > 1 && !query;

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over ? String(event.over.id) : '';
    const target = overId.startsWith(FOLDER_ENTRY_PREFIX) ? overId.slice(FOLDER_ENTRY_PREFIX.length) : null;
    setOverFolderId(target && target !== String(event.active.id) ? target : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    setOverFolderId(null);
    if (!dnd || !event.over) return;
    const draggedId = String(event.active.id);
    const overId = String(event.over.id);
    if (overId.startsWith(FOLDER_ENTRY_PREFIX)) {
      const folderId = overId.slice(FOLDER_ENTRY_PREFIX.length);
      if (folderId !== draggedId) dnd.onDropIntoFolder(draggedId, folderId);
      return;
    }
    if (draggedId === overId) return;
    const oldIdx = items.findIndex((i) => i.id === draggedId);
    const newIdx = items.findIndex((i) => i.id === overId);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(items, oldIdx, newIdx);
    const at = reordered.findIndex((i) => i.id === draggedId);
    dnd.onReorder(draggedId, reordered[at - 1]?.id ?? null, reordered[at + 1]?.id ?? null);
  }

  const activeItem = activeId ? items.find((i) => i.id === activeId) ?? null : null;

  const renderItem = (item: CollectionItem) => {
    const common: ItemProps = {
      item,
      editing: editingId === item.id,
      editUrl: props.editUrl,
      allowEmptyName: props.allowEmptyName,
      draggable: !!dnd && !query,
      isDropTarget: overFolderId === item.id,
      onOpen: (e) => props.onOpen(item, e),
      onStartEdit: () => setEditingId(item.id),
      onSave: async (result) => {
        const err = await props.onSave(item, result);
        if (!err) setEditingId(null);
        return err;
      },
      onCancelEdit: () => setEditingId(null),
      onDelete: () => props.onDelete(item),
      onContextMenu: props.onContextMenu ? () => props.onContextMenu!(item) : undefined,
    };
    return viewMode === 'grid' ? <GridItem key={item.id} {...common} /> : <ListItem key={item.id} {...common} />;
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
      background: 'var(--vela-bg-app)', color: 'var(--vela-fg)',
    }}>
      {/* Cabecera */}
      <div style={{ padding: '20px 20px 8px', flexShrink: 0, background: headerBg, borderBottom: '1px solid var(--vela-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 28 }}>
          {titleIcon && (
            <span style={{ fontSize: 20, lineHeight: 1, userSelect: 'none', flexShrink: 0 }}>{titleIcon}</span>
          )}
          {editingTitle && onRenameTitle ? (
            <ItemEditor
              item={{ id: '__title__', kind: 'folder', title, editableTitle: title }}
              editUrl={false}
              allowEmptyName={false}
              layout="row"
              fontSize={20}
              onSave={async ({ title: next }) => {
                if (next) await onRenameTitle(next);
                setEditingTitle(false);
                return null;
              }}
              onCancel={() => setEditingTitle(false)}
            />
          ) : (
            <>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title}
              </h1>
              {onRenameTitle && (
                <button type="button" title="Editar nombre" onClick={() => setEditingTitle(true)} style={{ ...iconBtn(false), flexShrink: 0 }}>
                  <IcoPencil />
                </button>
              )}
            </>
          )}
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--vela-fg-muted)' }}>
          {items.length} {items.length === 1 ? 'elemento' : 'elementos'}{query ? (items.length === 1 ? ' encontrado' : ' encontrados') : ''}
        </p>
      </div>

      {/* Migas de pan */}
      {showCrumbs && (
        <nav aria-label="Ruta" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, padding: '6px 20px', borderBottom: '1px solid var(--vela-border)', fontSize: 12, color: 'var(--vela-fg-muted)', flexShrink: 0 }}>
          {breadcrumb!.map((entry, i) => {
            const last = i === breadcrumb!.length - 1;
            return (
              <span key={entry.id ?? '__root__'} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && <IcoChevronRight />}
                <button
                  type="button"
                  disabled={last}
                  onClick={() => onNavigate?.(entry.id)}
                  style={{ background: 'none', border: 'none', cursor: 'default', fontSize: 12, padding: 0, color: last ? 'var(--vela-fg)' : 'var(--vela-fg-muted)', fontWeight: last ? 500 : 400 }}
                >
                  {entry.label}
                </button>
              </span>
            );
          })}
        </nav>
      )}

      {/* Barra */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '10px 20px', flexShrink: 0, background: 'var(--vela-bg-app)', borderBottom: '1px solid var(--vela-border)' }}>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={props.searchPlaceholder ?? 'Buscar…'}
          autoFocus
          style={{ flex: '1 1 200px', minWidth: 0, background: 'var(--vela-suggestion-bg)', border: '1px solid var(--vela-addressbar-border)', borderRadius: 8, padding: '5px 10px', fontSize: 13, color: 'var(--vela-fg)', outline: 'none' }}
        />
        <button type="button" onClick={() => onViewModeChange('grid')} title="Vista cuadrícula" aria-pressed={viewMode === 'grid'} style={iconBtn(viewMode === 'grid')}>
          <IcoGrid />
        </button>
        <button type="button" onClick={() => onViewModeChange('list')} title="Vista lista" aria-pressed={viewMode === 'list'} style={iconBtn(viewMode === 'list')}>
          <IcoList />
        </button>
        {props.toolbarExtra && (
          <>
            <div style={{ width: 1, height: 20, background: 'var(--vela-border)', flexShrink: 0 }} />
            {props.toolbarExtra}
          </>
        )}
      </div>

      {props.topSlot}

      {/* Contenido */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={(e) => { setActiveId(String(e.active.id)); setEditingId(null); }}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => { setActiveId(null); setOverFolderId(null); }}
      >
        <div className="vela-scroll" style={{ flex: 1, overflowY: 'auto' }}>
          {items.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--vela-fg-muted)', fontSize: 13, padding: '0 20px', textAlign: 'center' }}>
              {query ? 'Sin resultados' : props.emptyText}
            </div>
          ) : (
            <SortableContext items={items.map((i) => i.id)} strategy={viewMode === 'list' ? verticalListSortingStrategy : rectSortingStrategy}>
              {viewMode === 'list' ? (
                items.map(renderItem)
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, padding: 20 }}>
                  {items.map(renderItem)}
                </div>
              )}
            </SortableContext>
          )}
        </div>
        <DragOverlay>
          {activeItem && (
            <div style={{ background: 'var(--vela-bg-surface)', border: '1px solid var(--vela-accent)', borderRadius: 8, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--vela-fg)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', opacity: 0.9, maxWidth: 320 }}>
              {activeItem.kind === 'folder'
                ? <span style={{ fontSize: 14 }}>{activeItem.icon ?? '📁'}</span>
                : <FaviconImg src={activeItem.favicon} fallback={activeItem.title} size={16} />}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeItem.title}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {props.children}
    </div>
  );
}

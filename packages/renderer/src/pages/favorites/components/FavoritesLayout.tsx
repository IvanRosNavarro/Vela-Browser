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
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { generateKeyBetween } from 'fractional-indexing';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Favorite } from '@vela/shared';
import { IPC_EVENTS } from '@vela/shared';
import { FavoritesToolbar, type ViewMode } from './FavoritesToolbar';
import { FavoriteEditor } from './FavoriteEditor';

// ── Icons ─────────────────────────────────────────────────────────────────────

function IcoFolder({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--vela-accent)" stroke="var(--vela-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IcoChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function IcoEdit() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IcoTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4h6v2" />
    </svg>
  );
}

function IcoDrag() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="5" r="1.2" fill="currentColor" />
      <circle cx="15" cy="5" r="1.2" fill="currentColor" />
      <circle cx="9" cy="12" r="1.2" fill="currentColor" />
      <circle cx="15" cy="12" r="1.2" fill="currentColor" />
      <circle cx="9" cy="19" r="1.2" fill="currentColor" />
      <circle cx="15" cy="19" r="1.2" fill="currentColor" />
    </svg>
  );
}

// ── Favicon ───────────────────────────────────────────────────────────────────

function Favicon({ src, fallback, size = 20 }: { src: string | null; fallback: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 4, flexShrink: 0,
        background: 'var(--vela-bg-row-hover)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.floor(size * 0.55), fontWeight: 600,
        color: 'var(--vela-fg-muted)', textTransform: 'uppercase',
      }}>
        {fallback.slice(0, 1)}
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

// ── Breadcrumb ─────────────────────────────────────────────────────────────────

function Breadcrumb({ path, onNavigate }: { path: Favorite[]; onNavigate: (id: string | null) => void }) {
  if (path.length === 0) return null;
  const btnStyle: React.CSSProperties = { background: 'none', border: 'none', cursor: 'default', fontSize: 12, padding: 0 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 20px', borderBottom: '1px solid var(--vela-border)', fontSize: 12, color: 'var(--vela-fg-muted)', flexShrink: 0 }}>
      <button type="button" onClick={() => onNavigate(null)} style={{ ...btnStyle, color: 'var(--vela-fg-muted)' }}>Favoritos</button>
      {path.map((folder, i) => (
        <span key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <IcoChevronRight />
          <button type="button" onClick={() => onNavigate(folder.id)} style={{ ...btnStyle, color: i === path.length - 1 ? 'var(--vela-fg)' : 'var(--vela-fg-muted)' }}>
            {folder.title}
          </button>
        </span>
      ))}
    </div>
  );
}

// ── New folder inline input ────────────────────────────────────────────────────

function NewFolderInput({ onConfirm, onCancel }: { onConfirm: (title: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('Nueva carpeta');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.select(); }, []);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderBottom: '1px solid var(--vela-border)', background: 'color-mix(in srgb, var(--vela-accent) 8%, var(--vela-bg-surface))' }}>
      <IcoFolder size={18} />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm(value.trim() || 'Nueva carpeta');
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={() => onConfirm(value.trim() || 'Nueva carpeta')}
        style={{ flex: 1, height: 28, padding: '0 8px', borderRadius: 5, border: '1px solid var(--vela-accent)', background: 'var(--vela-bg-app)', color: 'var(--vela-fg)', fontSize: 13, outline: 'none' }}
        autoFocus
      />
      <button type="button" onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--vela-fg-muted)', cursor: 'default', fontSize: 12 }}>
        Cancelar
      </button>
    </div>
  );
}

// ── Collision detection: folder-entry zones take priority ─────────────────────

const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  const folderEntries = pointer.filter((c) => String(c.id).startsWith('folder-entry-'));
  if (folderEntries.length > 0) return folderEntries;
  return closestCenter(args);
};

// ── List row ──────────────────────────────────────────────────────────────────

interface ListRowProps {
  item: Favorite;
  isOverFolder: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ListRow({ item, isOverFolder, onOpen, onEdit, onDelete }: ListRowProps) {
  const [hovered, setHovered] = useState(false);
  const sort = useSortable({ id: item.id });
  const folderEntry = useDroppable({ id: `folder-entry-${item.id}` });

  return (
    <div
      ref={sort.setNodeRef}
      style={{ transform: CSS.Transform.toString(sort.transform), transition: sort.transition, opacity: sort.isDragging ? 0.4 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '7px 16px 7px 8px',
          borderBottom: '1px solid var(--vela-border)',
          background: isOverFolder ? 'color-mix(in srgb, var(--vela-accent) 12%, transparent)' : hovered ? 'var(--vela-bg-row-hover)' : 'transparent',
          transition: 'background 80ms', userSelect: 'none',
        }}
      >
        {/* Drag handle */}
        <div {...sort.listeners} {...sort.attributes} style={{ cursor: 'grab', opacity: hovered ? 0.5 : 0, transition: 'opacity 100ms', color: 'var(--vela-fg-muted)', padding: 4, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          <IcoDrag />
        </div>

        {/* Content — folder content is the drop-into-folder zone */}
        {item.type === 'folder' ? (
          <div ref={folderEntry.setNodeRef} onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, cursor: 'default' }}>
            <IcoFolder size={18} />
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--vela-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.title}
            </div>
          </div>
        ) : (
          <div onClick={onOpen} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, cursor: 'default' }}>
            <div style={{ flexShrink: 0 }}>
              <Favicon src={item.favicon} fallback={item.title || item.url || '?'} size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--vela-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.title || item.url}
              </div>
              {item.url && (
                <div style={{ fontSize: 11, color: 'var(--vela-fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.url}
                </div>
              )}
            </div>
          </div>
        )}

        {item.type === 'folder' && (
          <span style={{ color: 'var(--vela-fg-muted)', flexShrink: 0 }}><IcoChevronRight /></span>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 2, flexShrink: 0, opacity: hovered ? 1 : 0, transition: 'opacity 100ms' }}>
          <button type="button" title="Editar" onClick={onEdit}
            style={{ background: 'transparent', border: 'none', cursor: 'default', color: 'var(--vela-fg-muted)', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--vela-fg)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--vela-fg-muted)'; }}
          >
            <IcoEdit />
          </button>
          <button type="button" title="Eliminar" onClick={onDelete}
            style={{ background: 'transparent', border: 'none', cursor: 'default', color: 'var(--vela-fg-muted)', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--vela-insecure, #e05c5c)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--vela-fg-muted)'; }}
          >
            <IcoTrash />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Grid card ─────────────────────────────────────────────────────────────────

interface GridCardProps {
  item: Favorite;
  isOverFolder: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function GridCard({ item, isOverFolder, onOpen, onEdit, onDelete }: GridCardProps) {
  const [hovered, setHovered] = useState(false);
  const sort = useSortable({ id: item.id });
  const folderEntry = useDroppable({ id: `folder-entry-${item.id}` });
  const highlightFolder = isOverFolder && item.type === 'folder';

  return (
    <div
      ref={sort.setNodeRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        transform: CSS.Transform.toString(sort.transform),
        transition: [sort.transition, 'background 100ms', 'border-color 100ms'].filter(Boolean).join(', '),
        position: 'relative', width: 140, borderRadius: 8,
        border: `1px solid ${highlightFolder ? 'var(--vela-accent)' : 'var(--vela-border)'}`,
        background: highlightFolder ? 'color-mix(in srgb, var(--vela-accent) 12%, var(--vela-bg-surface))' : hovered ? 'var(--vela-bg-row-hover)' : 'var(--vela-bg-surface)',
        opacity: sort.isDragging ? 0.4 : 1,
        userSelect: 'none', overflow: 'hidden',
      }}
    >
      {/* Drag handle */}
      <div {...sort.listeners} {...sort.attributes} style={{ position: 'absolute', top: 4, left: 4, zIndex: 2, opacity: hovered ? 0.5 : 0, transition: 'opacity 100ms', cursor: 'grab', padding: 4, color: 'var(--vela-fg-muted)' }}>
        <IcoDrag />
      </div>

      {/* Folder visual is also the drop-into-folder zone */}
      {item.type === 'folder' ? (
        <div ref={folderEntry.setNodeRef} onClick={onOpen} style={{ cursor: 'default' }}>
          <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--vela-border)', background: 'var(--vela-bg-app)' }}>
            <IcoFolder size={36} />
          </div>
          <div style={{ padding: '8px 8px 6px' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--vela-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
          </div>
        </div>
      ) : (
        <div onClick={onOpen} style={{ cursor: 'default' }}>
          <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--vela-border)', background: 'var(--vela-bg-app)' }}>
            <Favicon src={item.favicon} fallback={item.title || item.url || '?'} size={32} />
          </div>
          <div style={{ padding: '8px 8px 6px' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--vela-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || item.url}</div>
            {item.url && (
              <div style={{ fontSize: 10, color: 'var(--vela-fg-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {(() => { try { return new URL(item.url).hostname; } catch { return item.url; } })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {hovered && (
        <div style={{ position: 'absolute', top: 4, right: 4, display: 'flex', gap: 2, background: 'var(--vela-bg-surface)', borderRadius: 5, padding: 2, zIndex: 3 }}>
          <button type="button" title="Editar" onClick={onEdit}
            style={{ background: 'transparent', border: 'none', cursor: 'default', color: 'var(--vela-fg-muted)', padding: 4, borderRadius: 4, display: 'flex' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--vela-fg)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--vela-fg-muted)'; }}
          ><IcoEdit /></button>
          <button type="button" title="Eliminar" onClick={onDelete}
            style={{ background: 'transparent', border: 'none', cursor: 'default', color: 'var(--vela-fg-muted)', padding: 4, borderRadius: 4, display: 'flex' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--vela-insecure, #e05c5c)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--vela-fg-muted)'; }}
          ><IcoTrash /></button>
        </div>
      )}
    </div>
  );
}

// ── Main layout ───────────────────────────────────────────────────────────────

export function FavoritesLayout() {
  const [allFavorites, setAllFavorites] = useState<Favorite[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [editingItem, setEditingItem] = useState<Favorite | null>(null);

  // Load persisted view mode on mount
  useEffect(() => {
    void window.api.settings.get({ key: 'favorites:view-mode' }).then((res) => {
      if (res.ok) {
        const v = res.data?.value;
        if (v === 'grid' || v === 'list') setViewMode(v);
      }
    });
  }, []);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overFolderId, setOverFolderId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await window.api.favorites.list();
    if (res.ok) setAllFavorites(res.data);
  }, []);

  useEffect(() => {
    void load();
    const off = window.api.on(IPC_EVENTS.FAVORITES_CHANGED, (payload) => {
      setAllFavorites(payload.favorites);
    });
    return off;
  }, [load]);

  // Breadcrumb path from root to current folder
  const breadcrumbPath: Favorite[] = [];
  if (currentFolderId) {
    let fid: string | null = currentFolderId;
    const visited = new Set<string>();
    while (fid && !visited.has(fid)) {
      visited.add(fid);
      const folder = allFavorites.find((f) => f.id === fid && f.type === 'folder');
      if (folder) { breadcrumbPath.unshift(folder); fid = folder.parentId; }
      else break;
    }
  }

  // Items in current view, sorted by position
  let displayItems: Favorite[];
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    displayItems = allFavorites
      .filter((f) => f.title.toLowerCase().includes(q) || (f.url?.toLowerCase().includes(q) ?? false))
      .sort((a, b) => (a.position < b.position ? -1 : 1));
  } else {
    displayItems = allFavorites
      .filter((f) => f.parentId === currentFolderId)
      .sort((a, b) => (a.position < b.position ? -1 : 1));
  }

  const activeFav = activeId ? allFavorites.find((f) => f.id === activeId) ?? null : null;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    if (!event.over) { setOverFolderId(null); return; }
    const overId = String(event.over.id);
    setOverFolderId(overId.startsWith('folder-entry-') ? overId.slice('folder-entry-'.length) : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    setOverFolderId(null);
    const { active, over } = event;
    if (!over) return;

    const draggedId = String(active.id);
    const overId = String(over.id);

    // Drop onto folder-entry zone → move item into that folder
    if (overId.startsWith('folder-entry-')) {
      const targetFolderId = overId.slice('folder-entry-'.length);
      if (targetFolderId === draggedId) return;
      const children = allFavorites
        .filter((f) => f.parentId === targetFolderId)
        .sort((a, b) => (a.position < b.position ? -1 : 1));
      const newPosition = generateKeyBetween(children.at(-1)?.position ?? null, null);
      void window.api.favorites.move({ id: draggedId, parentId: targetFolderId, newPosition });
      return;
    }

    // Reorder within current view
    if (draggedId === overId) return;
    const oldIdx = displayItems.findIndex((f) => f.id === draggedId);
    const newIdx = displayItems.findIndex((f) => f.id === overId);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = arrayMove(displayItems, oldIdx, newIdx);
    const insertedIdx = reordered.findIndex((f) => f.id === draggedId);
    const prev = reordered[insertedIdx - 1]?.position ?? null;
    const next = reordered[insertedIdx + 1]?.position ?? null;
    const newPosition = generateKeyBetween(prev, next);

    const dragged = allFavorites.find((f) => f.id === draggedId);
    const overItem = allFavorites.find((f) => f.id === overId);
    if (!dragged || !overItem) return;

    if (dragged.parentId !== overItem.parentId) {
      void window.api.favorites.move({ id: draggedId, parentId: overItem.parentId, newPosition });
    } else {
      void window.api.favorites.reorder({ id: draggedId, newPosition });
    }
  }

  function openItem(item: Favorite) {
    if (item.type === 'folder') {
      setCurrentFolderId(item.id);
      setQuery('');
    } else if (item.url) {
      void window.api.window.openUrlInNewTab({ url: item.url });
    }
  }

  async function handleSaveEdit(data: { title: string; url?: string }) {
    if (!editingItem) return;
    await window.api.favorites.update({ id: editingItem.id, title: data.title, url: data.url ?? undefined });
    setEditingItem(null);
  }

  async function handleConfirmNewFolder(title: string) {
    setCreatingFolder(false);
    if (!title) return;
    await window.api.favorites.createFolder({ title, parentId: currentFolderId });
  }

  async function handleOpenAll() {
    const toOpen = displayItems.filter((f) => f.type === 'bookmark' && f.url);
    if (toOpen.length > 10 && !confirm(`¿Abrir ${toOpen.length} pestañas?`)) return;
    for (const fav of toOpen) {
      if (fav.url) await window.api.window.openUrlInNewTab({ url: fav.url });
    }
  }

  async function handleExport() {
    const data = allFavorites.map(({ url, title, type, parentId, position }) => ({ url, title, type, parentId, position }));
    await window.api.favorites.exportFile({ data: JSON.stringify(data, null, 2) });
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const items = JSON.parse(text) as unknown;
      if (!Array.isArray(items)) return;
      const existingUrls = new Set(allFavorites.filter((f) => f.url).map((f) => f.url!));
      for (const item of items) {
        if (typeof item === 'object' && item !== null) {
          const entry = item as { url?: string; title?: string };
          if (entry.url && !existingUrls.has(entry.url)) {
            await window.api.favorites.add({ url: entry.url, title: entry.title ?? '', parentId: currentFolderId });
            existingUrls.add(entry.url);
          }
        }
      }
    } catch { /* ignore malformed JSON */ }
    e.target.value = '';
  }

  const sortableIds = displayItems.map((f) => f.id);
  const strategy = viewMode === 'list' ? verticalListSortingStrategy : rectSortingStrategy;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--vela-bg-app)', color: 'var(--vela-fg)' }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 8px', flexShrink: 0, borderBottom: '1px solid var(--vela-border)' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Favoritos</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--vela-fg-muted)' }}>
          {displayItems.length} {displayItems.length === 1 ? 'elemento' : 'elementos'}{query && ' encontrados'}
        </p>
      </div>

      <FavoritesToolbar
        query={query}
        onQueryChange={setQuery}
        viewMode={viewMode}
        onViewModeChange={(mode) => {
          setViewMode(mode);
          void window.api.settings.set({ key: 'favorites:view-mode', value: mode });
        }}
        onNewFolder={() => setCreatingFolder(true)}
        onOpenAll={() => void handleOpenAll()}
        onExport={() => void handleExport()}
        onImport={() => fileInputRef.current?.click()}
      />

      {!query && <Breadcrumb path={breadcrumbPath} onNavigate={(id) => { setCurrentFolderId(id); }} />}

      {creatingFolder && !query && (
        <NewFolderInput
          onConfirm={(t) => void handleConfirmNewFolder(t)}
          onCancel={() => setCreatingFolder(false)}
        />
      )}

      {/* Content */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => { setActiveId(null); setOverFolderId(null); }}
      >
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {displayItems.length === 0 && !creatingFolder ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--vela-fg-muted)', fontSize: 13 }}>
              {query ? 'Sin resultados' : 'Esta carpeta está vacía'}
            </div>
          ) : (
            <SortableContext items={sortableIds} strategy={strategy}>
              {viewMode === 'grid' ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 20 }}>
                  {displayItems.map((item) => (
                    <GridCard
                      key={item.id}
                      item={item}
                      isOverFolder={overFolderId === item.id}
                      onOpen={() => openItem(item)}
                      onEdit={() => setEditingItem(item)}
                      onDelete={() => void window.api.favorites.remove({ id: item.id })}
                    />
                  ))}
                </div>
              ) : (
                <div>
                  {displayItems.map((item) => (
                    <ListRow
                      key={item.id}
                      item={item}
                      isOverFolder={overFolderId === item.id}
                      onOpen={() => openItem(item)}
                      onEdit={() => setEditingItem(item)}
                      onDelete={() => void window.api.favorites.remove({ id: item.id })}
                    />
                  ))}
                </div>
              )}
            </SortableContext>
          )}
        </div>

        <DragOverlay>
          {activeFav && (
            <div style={{ background: 'var(--vela-bg-surface)', border: '1px solid var(--vela-accent)', borderRadius: 8, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--vela-fg)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', opacity: 0.9 }}>
              {activeFav.type === 'folder' ? <IcoFolder size={16} /> : <Favicon src={activeFav.favicon} fallback={activeFav.title || '?'} size={16} />}
              {activeFav.title || activeFav.url}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {editingItem && (
        <FavoriteEditor
          item={editingItem}
          onSave={(data) => void handleSaveEdit(data)}
          onCancel={() => setEditingItem(null)}
        />
      )}

      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => void handleFileSelected(e)} />
    </div>
  );
}

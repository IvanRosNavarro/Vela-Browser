import { generateKeyBetween } from 'fractional-indexing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IPC_EVENTS, normalizeFavoriteUrl } from '@vela/shared';
import type { Favorite, MenuItemSpec } from '@vela/shared';
import { showContextMenu } from '../../../lib/contextMenu';
import { writeToClipboard } from '../../../lib/clipboard';
import { Toaster } from '../../../components/Toaster';
import { toast } from '../../../stores/toastStore';
import {
  CollectionView,
  ConfirmDialog,
  IcoFolder,
  iconBtn,
  useViewModeSetting,
  type BreadcrumbEntry,
  type CollectionEditResult,
  type CollectionItem,
  type ConfirmAction,
} from '../../../shared-ui/collection-view';

function byPosition(a: Favorite, b: Favorite): number {
  return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
}

function displayTitle(f: Favorite): string {
  if (f.title.trim()) return f.title;
  if (f.type === 'folder') return 'Carpeta';
  try { return new URL(f.url ?? '').hostname || (f.url ?? ''); } catch { return f.url ?? ''; }
}

function descendantIds(all: Favorite[], id: string): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const f of all) {
      if (f.parentId === cur && !out.has(f.id)) {
        out.add(f.id);
        stack.push(f.id);
      }
    }
  }
  return out;
}

/** Posición al final de una carpeta. */
function endPosition(all: Favorite[], parentId: string | null): string {
  const last = all.filter((f) => f.parentId === parentId).sort(byPosition).at(-1);
  return generateKeyBetween(last?.position ?? null, null);
}

function NewFolderInput({ onConfirm, onCancel }: { onConfirm: (title: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState('Nueva carpeta');
  const doneRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.select(); }, []);
  const confirm = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onConfirm(value.trim() || 'Nueva carpeta');
  };
  const cancel = () => {
    doneRef.current = true;
    onCancel();
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', borderBottom: '1px solid var(--vela-border)', background: 'color-mix(in srgb, var(--vela-accent) 8%, var(--vela-bg-surface))' }}>
      <span style={{ color: 'var(--vela-accent)', display: 'flex' }}><IcoFolder size={18} /></span>
      <input
        ref={inputRef}
        value={value}
        aria-label="Nombre de la carpeta"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); confirm(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        onBlur={confirm}
        style={{ flex: 1, height: 28, padding: '0 8px', borderRadius: 5, border: '1px solid var(--vela-accent)', background: 'var(--vela-bg-app)', color: 'var(--vela-fg)', fontSize: 13, outline: 'none' }}
        autoFocus
      />
      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={cancel} style={{ background: 'none', border: 'none', color: 'var(--vela-fg-muted)', cursor: 'default', fontSize: 12 }}>
        Cancelar
      </button>
    </div>
  );
}

type Pending =
  | { kind: 'delete-folder'; folder: Favorite; count: number }
  | { kind: 'open-all'; urls: string[] };

export function FavoritesLayout() {
  const [allFavorites, setAllFavorites] = useState<Favorite[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useViewModeSetting('favorites:view-mode');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
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

  const byId = useMemo(() => new Map(allFavorites.map((f) => [f.id, f])), [allFavorites]);

  // Si la carpeta abierta desaparece (borrada aquí o desde otro dispositivo),
  // volver a la raíz.
  useEffect(() => {
    if (currentFolderId && allFavorites.length > 0 && !byId.has(currentFolderId)) setCurrentFolderId(null);
  }, [allFavorites.length, byId, currentFolderId]);

  const pathOf = useCallback((folderId: string | null): Favorite[] => {
    const path: Favorite[] = [];
    const seen = new Set<string>();
    let fid = folderId;
    while (fid && !seen.has(fid)) {
      seen.add(fid);
      const folder = byId.get(fid);
      if (!folder || folder.type !== 'folder') break;
      path.unshift(folder);
      fid = folder.parentId;
    }
    return path;
  }, [byId]);

  const currentFolder = currentFolderId ? byId.get(currentFolderId) ?? null : null;
  const breadcrumb: BreadcrumbEntry[] = [
    { id: null, label: 'Favoritos' },
    ...pathOf(currentFolderId).map((f) => ({ id: f.id, label: displayTitle(f) })),
  ];

  const displayed = useMemo<Favorite[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allFavorites.filter((f) => f.parentId === currentFolderId).sort(byPosition);
    // El buscador recorre todas las carpetas, no solo la abierta.
    return allFavorites
      .filter((f) => f.title.toLowerCase().includes(q) || (f.url?.toLowerCase().includes(q) ?? false))
      .sort(byPosition);
  }, [allFavorites, currentFolderId, query]);

  const items = useMemo<CollectionItem[]>(() => displayed.map((f) => ({
    id: f.id,
    kind: f.type === 'folder' ? 'folder' : 'link',
    title: displayTitle(f),
    editableTitle: f.title,
    url: f.url,
    favicon: f.favicon,
    hint: query.trim()
      ? (pathOf(f.parentId).map(displayTitle).join(' › ') || 'Favoritos')
      : null,
  })), [displayed, pathOf, query]);

  const openFolder = useCallback((id: string | null) => {
    setCurrentFolderId(id);
    setQuery('');
    setCreatingFolder(false);
  }, []);

  const handleOpen = useCallback((item: CollectionItem) => {
    const fav = byId.get(item.id);
    if (!fav) return;
    if (fav.type === 'folder') openFolder(fav.id);
    else if (fav.url) void window.api.window.openUrlInNewTab({ url: fav.url });
  }, [byId, openFolder]);

  const handleSave = useCallback(async (item: CollectionItem, result: CollectionEditResult): Promise<string | null> => {
    const fav = byId.get(item.id);
    if (!fav) return 'El favorito ya no existe';
    if (!result.title) return 'El nombre no puede quedar vacío';
    let url: string | undefined;
    if (fav.type === 'bookmark' && result.url !== undefined) {
      const normalized = normalizeFavoriteUrl(result.url);
      if (!normalized) return 'Dirección no válida: usa una URL http(s), ftp, file, mailto o vela';
      if (normalized !== fav.url) url = normalized;
    }
    const res = await window.api.favorites.update({ id: fav.id, title: result.title, ...(url ? { url } : {}) });
    if (res.ok) return null;
    const reason = (res.details as { reason?: string } | undefined)?.reason;
    return reason === 'DUPLICATE_URL' ? 'Ya hay otro favorito con esa dirección' : 'No se pudo guardar';
  }, [byId]);

  const removeBookmark = useCallback(async (fav: Favorite) => {
    const res = await window.api.favorites.remove({ id: fav.id });
    if (!res.ok || !fav.url) return;
    const url = fav.url;
    toast(`Favorito eliminado: ${displayTitle(fav)} · Deshacer`, 'info', () => {
      void window.api.favorites.add({ url, title: fav.title, favicon: fav.favicon, parentId: fav.parentId });
    });
  }, []);

  const handleDelete = useCallback((item: CollectionItem) => {
    const fav = byId.get(item.id);
    if (!fav) return;
    if (fav.type === 'bookmark') {
      void removeBookmark(fav);
      return;
    }
    const count = descendantIds(allFavorites, fav.id).size;
    if (count === 0) {
      void window.api.favorites.remove({ id: fav.id });
      return;
    }
    setPending({ kind: 'delete-folder', folder: fav, count });
  }, [allFavorites, byId, removeBookmark]);

  const moveTo = useCallback((id: string, parentId: string | null) => {
    const fav = byId.get(id);
    if (!fav || fav.parentId === parentId) return;
    void window.api.favorites.move({ id, parentId, newPosition: endPosition(allFavorites, parentId) }).then((res) => {
      if (!res.ok) toast('No se puede mover una carpeta dentro de sí misma', 'warning');
    });
  }, [allFavorites, byId]);

  /** Carpetas a las que se puede mover `id`, con sangría por profundidad. */
  const moveTargets = useCallback((id: string): MenuItemSpec[] => {
    const exclude = descendantIds(allFavorites, id);
    exclude.add(id);
    const fav = byId.get(id);
    const out: MenuItemSpec[] = [
      { type: 'normal', id: 'move:__root__', label: 'Favoritos (raíz)', enabled: fav?.parentId !== null },
    ];
    const walk = (parentId: string | null, depth: number): void => {
      for (const f of allFavorites.filter((x) => x.parentId === parentId && x.type === 'folder').sort(byPosition)) {
        if (exclude.has(f.id)) continue;
        out.push({
          type: 'normal',
          id: `move:${f.id}`,
          label: `${'    '.repeat(depth)}${displayTitle(f)}`,
          enabled: fav?.parentId !== f.id,
        });
        if (depth < 12) walk(f.id, depth + 1);
      }
    };
    walk(null, 1);
    return out;
  }, [allFavorites, byId]);

  const handleContextMenu = useCallback((item: CollectionItem) => {
    const fav = byId.get(item.id);
    if (!fav) return;
    const targets = moveTargets(fav.id);
    const items: MenuItemSpec[] = [
      { type: 'normal', id: 'open', label: fav.type === 'folder' ? 'Abrir carpeta' : 'Abrir en una pestaña nueva' },
      ...(fav.url ? [{ type: 'normal' as const, id: 'copy', label: 'Copiar enlace' }] : []),
      { type: 'separator' },
      { type: 'submenu', label: 'Mover a…', submenu: targets },
      { type: 'separator' },
      { type: 'normal', id: 'delete', label: fav.type === 'folder' ? 'Eliminar carpeta' : 'Eliminar' },
    ];
    const actions: Record<string, () => void> = {
      open: () => handleOpen(item),
      copy: () => { if (fav.url) void writeToClipboard(fav.url); },
      delete: () => handleDelete(item),
      'move:__root__': () => moveTo(fav.id, null),
    };
    for (const t of targets) {
      if (t.type === 'normal' && t.id !== 'move:__root__') {
        const folderId = t.id.slice('move:'.length);
        actions[t.id] = () => moveTo(fav.id, folderId);
      }
    }
    void showContextMenu(items, actions);
  }, [byId, handleDelete, handleOpen, moveTargets, moveTo]);

  const dnd = useMemo(() => ({
    onReorder: (draggedId: string, prevId: string | null, nextId: string | null) => {
      const prev = prevId ? byId.get(prevId)?.position ?? null : null;
      const next = nextId ? byId.get(nextId)?.position ?? null : null;
      let newPosition: string;
      try {
        newPosition = generateKeyBetween(prev, next);
      } catch {
        // Posiciones iguales o desordenadas: al final, antes que fallar.
        newPosition = endPosition(allFavorites, currentFolderId);
      }
      const dragged = byId.get(draggedId);
      if (dragged && dragged.parentId !== currentFolderId) {
        void window.api.favorites.move({ id: draggedId, parentId: currentFolderId, newPosition });
      } else {
        void window.api.favorites.reorder({ id: draggedId, newPosition });
      }
    },
    onDropIntoFolder: (draggedId: string, folderId: string) => moveTo(draggedId, folderId),
  }), [allFavorites, byId, currentFolderId, moveTo]);

  async function handleConfirmNewFolder(title: string) {
    setCreatingFolder(false);
    await window.api.favorites.createFolder({ title, parentId: currentFolderId });
  }

  async function openUrls(urls: string[]) {
    for (const url of urls) await window.api.window.openUrlInNewTab({ url });
  }

  function handleOpenAll() {
    const urls = displayed.filter((f) => f.type === 'bookmark' && f.url).map((f) => f.url!);
    if (urls.length === 0) return;
    if (urls.length > 10) setPending({ kind: 'open-all', urls });
    else void openUrls(urls);
  }

  async function handleExport() {
    const data = allFavorites.map(({ id, url, title, type, parentId, position }) => ({ id, url, title, type, parentId, position }));
    await window.api.favorites.exportFile({ data: JSON.stringify(data, null, 2) });
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let added = 0;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!Array.isArray(parsed)) throw new Error('formato');
      const existingUrls = new Set(allFavorites.filter((f) => f.url).map((f) => f.url!));
      for (const entry of parsed) {
        if (typeof entry !== 'object' || entry === null) continue;
        const { url, title } = entry as { url?: unknown; title?: unknown };
        if (typeof url !== 'string') continue;
        const normalized = normalizeFavoriteUrl(url);
        if (!normalized || existingUrls.has(normalized)) continue;
        const res = await window.api.favorites.add({ url: normalized, title: typeof title === 'string' ? title : '', parentId: currentFolderId });
        if (res.ok) {
          existingUrls.add(normalized);
          added++;
        }
      }
      toast(added === 1 ? 'Importado 1 favorito' : `Importados ${added} favoritos`, 'success');
    } catch {
      toast('El archivo no es una exportación de Favoritos válida', 'error');
    }
  }

  const confirmPending = (actionId: string) => {
    if (!pending) return;
    if (pending.kind === 'delete-folder') {
      void window.api.favorites.remove({ id: pending.folder.id, cascade: actionId === 'all' });
    } else {
      void openUrls(pending.urls);
    }
    setPending(null);
  };

  const confirmProps: { title: string; message: string; actions: ConfirmAction[] } | null = !pending
    ? null
    : pending.kind === 'delete-folder'
      ? {
          title: `Eliminar «${displayTitle(pending.folder)}»`,
          message: `La carpeta contiene ${pending.count} ${pending.count === 1 ? 'elemento' : 'elementos'}. Puedes conservarlos (pasan a la carpeta superior) o eliminarlos junto con ella.`,
          actions: [
            { id: 'keep', label: 'Eliminar solo la carpeta' },
            { id: 'all', label: 'Eliminar todo', danger: true },
          ],
        }
      : {
          title: 'Abrir todos',
          message: `Se abrirán ${pending.urls.length} pestañas.`,
          actions: [{ id: 'open', label: 'Abrir' }],
        };

  return (
    <CollectionView
      title={currentFolder ? displayTitle(currentFolder) : 'Favoritos'}
      onRenameTitle={currentFolder ? async (name) => { await window.api.favorites.update({ id: currentFolder.id, title: name }); } : undefined}
      breadcrumb={breadcrumb}
      onNavigate={openFolder}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder="Buscar en todos los favoritos…"
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      toolbarExtra={(
        <>
          <button type="button" onClick={() => { setQuery(''); setCreatingFolder(true); }} title="Nueva carpeta" style={iconBtn(false)}>
            <IcoFolder /> Nueva carpeta
          </button>
          <button type="button" onClick={handleOpenAll} title="Abrir todos los favoritos de esta vista" style={iconBtn(false)}>Abrir todos</button>
          <button type="button" onClick={() => void window.api.commands.execute('internal.openBrowserImport')} title="Importar marcadores e historial de Chrome, Edge, Firefox…" style={iconBtn(false)}>
            Importar de otro navegador
          </button>
          <button type="button" onClick={() => void handleExport()} title="Exportar a un archivo JSON" style={iconBtn(false)}>Exportar</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} title="Importar un archivo JSON exportado desde Vela" style={iconBtn(false)}>Importar archivo</button>
        </>
      )}
      topSlot={creatingFolder && !query ? (
        <NewFolderInput onConfirm={(t) => void handleConfirmNewFolder(t)} onCancel={() => setCreatingFolder(false)} />
      ) : null}
      items={items}
      emptyText={currentFolder
        ? 'Esta carpeta está vacía'
        : 'Aún no tienes favoritos. Añádelos con la estrella de la barra de direcciones o impórtalos de otro navegador.'}
      editUrl
      allowEmptyName={false}
      onOpen={handleOpen}
      onSave={handleSave}
      onDelete={handleDelete}
      onContextMenu={handleContextMenu}
      dnd={dnd}
    >
      {confirmProps && (
        <ConfirmDialog
          title={confirmProps.title}
          message={confirmProps.message}
          actions={confirmProps.actions}
          onSelect={confirmPending}
          onCancel={() => setPending(null)}
        />
      )}
      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => void handleFileSelected(e)} />
      <Toaster />
    </CollectionView>
  );
}

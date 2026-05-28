import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { IPC_EVENTS, type DownloadItem } from '@vela/shared';

// ── Icons ─────────────────────────────────────────────────────────────────────

function IcoFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IcoTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
function IcoX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IcoPause() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}
function IcoPlay() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
function IcoRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
function IcoSearch() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
function IcoExternalFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <polyline points="17 8 17 13 12 13" />
    </svg>
  );
}

// File type icons
function IcoPdf() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <text x="6" y="18" fontSize="5" fill="currentColor" stroke="none" fontWeight="700">PDF</text>
    </svg>
  );
}
function IcoZip() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="12" x2="12" y2="17" strokeDasharray="2 1" />
    </svg>
  );
}
function IcoImage() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}
function IcoVideo() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <polygon points="10 15 14 12 10 9 10 15" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IcoAudio() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  );
}
function IcoExe() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="12" y2="17" />
    </svg>
  );
}
function IcoGenericFile() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFileIcon(filename: string, mimeType: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return <IcoPdf />;
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return <IcoZip />;
  if (['doc', 'docx', 'odt', 'rtf', 'txt'].includes(ext)) return <IcoGenericFile />;
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return <IcoGenericFile />;
  if (['exe', 'msi', 'dmg', 'deb', 'pkg', 'appimage'].includes(ext)) return <IcoExe />;
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv'].includes(ext)) return <IcoVideo />;
  if (['mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a'].includes(ext)) return <IcoAudio />;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return <IcoImage />;
  if (mimeType.startsWith('image/')) return <IcoImage />;
  if (mimeType.startsWith('video/')) return <IcoVideo />;
  if (mimeType.startsWith('audio/')) return <IcoAudio />;
  return <IcoGenericFile />;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (day.getTime() === today.getTime()) return 'Hoy';
  if (day.getTime() === yesterday.getTime()) return 'Ayer';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getCategory(item: DownloadItem): string {
  const ext = item.filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'PDF';
  if (['doc', 'docx', 'txt', 'odt', 'rtf'].includes(ext)) return 'Documentos';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'Documentos';
  if (['exe', 'msi', 'dmg', 'deb', 'pkg', 'appimage'].includes(ext)) return 'Aplicaciones';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) return 'Imágenes';
  if (item.mimeType.startsWith('image/')) return 'Imágenes';
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return 'Archivos comprimidos';
  if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv'].includes(ext)) return 'Vídeos';
  if (item.mimeType.startsWith('video/')) return 'Vídeos';
  if (['mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a'].includes(ext)) return 'Audio';
  if (item.mimeType.startsWith('audio/')) return 'Audio';
  return 'Otros';
}

type Category = 'Todos los archivos' | 'PDF' | 'Documentos' | 'Aplicaciones' | 'Imágenes' | 'Archivos comprimidos' | 'Vídeos' | 'Audio' | 'Otros';
const ALL_CATEGORIES: Category[] = ['Todos los archivos', 'PDF', 'Documentos', 'Aplicaciones', 'Imágenes', 'Archivos comprimidos', 'Vídeos', 'Audio', 'Otros'];

// ── Confirm dialog ─────────────────────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--vela-bg-surface, #1c1f26)',
        border: '1px solid var(--vela-border, rgba(255,255,255,0.1))',
        borderRadius: 10, padding: 20, maxWidth: 360, width: '90%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        <p style={{ fontSize: 13, color: 'var(--vela-fg, #e0e0e0)', marginBottom: 16 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '6px 14px', borderRadius: 6, border: '1px solid var(--vela-border, rgba(255,255,255,0.12))',
            background: 'transparent', color: 'var(--vela-fg-secondary, rgba(255,255,255,0.6))', fontSize: 12, cursor: 'pointer',
          }}>
            Cancelar
          </button>
          <button onClick={onConfirm} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none',
            background: 'rgba(239,68,68,0.85)', color: '#fff', fontSize: 12, cursor: 'pointer',
          }}>
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── DownloadRow ───────────────────────────────────────────────────────────────

function DownloadRowFull({ item, onRemove, onDeleteFile, onRefresh }: {
  item: DownloadItem;
  onRemove: (id: string) => void;
  onDeleteFile: (id: string, savePath: string) => void;
  onRefresh: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isActive = item.state === 'progressing';
  const pct = item.totalBytes > 0 ? Math.round((item.receivedBytes / item.totalBytes) * 100) : null;

  const actionBtn: CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 5, border: 'none',
    background: 'transparent', color: 'var(--vela-fg-muted, rgba(255,255,255,0.45))',
    cursor: 'pointer', padding: 0, flexShrink: 0,
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '10px 16px',
        background: hovered ? 'var(--vela-hover, rgba(255,255,255,0.04))' : 'transparent',
        borderRadius: 6,
        transition: 'background 120ms',
      }}
    >
      {/* File type icon */}
      <div style={{ flexShrink: 0, color: 'var(--vela-fg-muted, rgba(255,255,255,0.4))', paddingTop: 2 }}>
        {getFileIcon(item.filename, item.mimeType)}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--vela-fg, #e0e0e0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.filename}
        </div>
        <div style={{ fontSize: 11, color: 'var(--vela-fg-muted, rgba(255,255,255,0.4))', marginTop: 2 }}>
          {formatBytes(item.totalBytes || item.receivedBytes)} · {item.mimeType || 'archivo'}
        </div>

        {isActive && (
          <div style={{ marginTop: 6 }}>
            <div style={{ height: 4, background: 'var(--vela-border, rgba(255,255,255,0.1))', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: pct !== null ? `${pct}%` : '40%',
                background: item.paused ? 'var(--vela-fg-muted, rgba(255,255,255,0.3))' : 'var(--vela-accent, #4f8ef7)',
                borderRadius: 2,
                transition: 'width 400ms ease',
              } as CSSProperties} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button style={actionBtn} title={item.paused ? 'Reanudar' : 'Pausar'}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.08))'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                onClick={() => {
                  const op = item.paused ? window.api.downloads.resume(item.id) : window.api.downloads.pause(item.id);
                  void op.then(onRefresh);
                }}>
                {item.paused ? <IcoPlay /> : <IcoPause />}
              </button>
              <button style={actionBtn} title="Cancelar"
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.08))'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                onClick={() => void window.api.downloads.cancel(item.id).then(onRefresh)}>
                <IcoX />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Row actions (visible on hover or if not active) */}
      {!isActive && (
        <div style={{ display: 'flex', gap: 4, opacity: hovered ? 1 : 0, transition: 'opacity 150ms' }}>
          {item.state === 'completed' && (
            <>
              <button style={actionBtn} title="Abrir carpeta contenedora"
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.08))'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                onClick={() => void window.api.downloads.showInFolder(item.savePath)}>
                <IcoFolder />
              </button>
              <button style={{ ...actionBtn, color: 'rgba(239,68,68,0.7)' }} title="Eliminar archivo"
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.08))'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                onClick={() => onDeleteFile(item.id, item.savePath)}>
                <IcoTrash />
              </button>
            </>
          )}
          {(item.state === 'cancelled' || item.state === 'interrupted') && (
            <button style={actionBtn} title="Reintentar"
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.08))'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              onClick={() => void window.api.window.openUrlInNewTab({ url: item.url, activate: true })}>
              <IcoRefresh />
            </button>
          )}
          {/* Remove from list */}
          <button style={actionBtn} title="Quitar de la lista"
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.08))'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            onClick={() => onRemove(item.id)}>
            <IcoX />
          </button>
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export function App() {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category>('Todos los archivos');
  const [confirm, setConfirm] = useState<{ id: string; savePath: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await window.api.downloads.getAll();
    if (res.ok) setItems(res.data);
  }, []);

  useEffect(() => {
    void refresh();
    // Push events from the shell don't reach this WCV, so poll while active downloads exist
    const off = window.api.on(IPC_EVENTS.DOWNLOADS_CHANGED, ({ items: next }) => {
      setItems(next);
    });
    return off;
  }, [refresh]);

  // Poll every second while any download is in progress
  useEffect(() => {
    const hasActive = items.some((d) => d.state === 'progressing');
    if (!hasActive) return;
    const id = setInterval(() => { void refresh(); }, 1000);
    return () => clearInterval(id);
  }, [items, refresh]);

  const filtered = useMemo(() => {
    let result = items;
    if (activeCategory !== 'Todos los archivos') {
      result = result.filter((d) => getCategory(d) === activeCategory);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((d) => d.filename.toLowerCase().includes(q));
    }
    return result;
  }, [items, activeCategory, query]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) {
      const cat = getCategory(item);
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: { label: string; items: DownloadItem[] }[] = [];
    const seen = new Map<string, DownloadItem[]>();
    for (const item of [...filtered].sort((a, b) => b.startedAt - a.startedAt)) {
      const label = formatDate(item.startedAt);
      if (!seen.has(label)) { seen.set(label, []); groups.push({ label, items: seen.get(label)! }); }
      seen.get(label)!.push(item);
    }
    return groups;
  }, [filtered]);

  const handleRemove = useCallback(async (id: string) => {
    await window.api.downloads.remove(id);
    void refresh();
  }, [refresh]);

  const handleDeleteFile = useCallback((id: string, savePath: string) => {
    setConfirm({ id, savePath });
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!confirm) return;
    await window.api.downloads.openFile(confirm.savePath).catch(() => {});
    await window.api.downloads.remove(confirm.id);
    setConfirm(null);
    void refresh();
  }, [confirm, refresh]);

  const handleClearCompleted = useCallback(async () => {
    await window.api.downloads.clearCompleted();
    void refresh();
  }, [refresh]);

  const openDownloadsFolder = useCallback(() => {
    void window.api.downloads.openFolder();
  }, []);

  const labelStyle: CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: 'var(--vela-fg-muted, rgba(255,255,255,0.4))',
    padding: '6px 12px 4px',
    userSelect: 'none',
  };

  const catBtnStyle = (active: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '5px 12px',
    height: 30,
    border: 'none',
    borderRadius: 5,
    background: active ? 'var(--vela-accent-subtle, rgba(79,142,247,0.15))' : 'transparent',
    color: active ? 'var(--vela-accent, #4f8ef7)' : 'var(--vela-fg-secondary, rgba(255,255,255,0.65))',
    fontSize: 12,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 120ms',
  });

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: 'var(--vela-bg-app, #13151a)',
      color: 'var(--vela-fg, #e0e0e0)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          message={`¿Eliminar "${confirm.savePath.split(/[/\\]/).pop()}" del disco?`}
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* Sidebar */}
      <aside style={{
        width: 200,
        borderRight: '1px solid var(--vela-border, rgba(255,255,255,0.07))',
        flexShrink: 0,
        padding: '16px 6px',
        overflowY: 'auto',
      }}>
        <div style={labelStyle}>Filtrar</div>
        {ALL_CATEGORIES.map((cat) => (
          <button key={cat} style={catBtnStyle(activeCategory === cat)} onClick={() => setActiveCategory(cat)}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
            {cat !== 'Todos los archivos' && categoryCounts[cat] != null && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: activeCategory === cat ? 'var(--vela-accent, #4f8ef7)' : 'var(--vela-fg-muted, rgba(255,255,255,0.3))',
                flexShrink: 0,
              }}>
                {categoryCounts[cat]}
              </span>
            )}
            {cat === 'Todos los archivos' && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: activeCategory === cat ? 'var(--vela-accent, #4f8ef7)' : 'var(--vela-fg-muted, rgba(255,255,255,0.3))',
                flexShrink: 0,
              }}>
                {items.length}
              </span>
            )}
          </button>
        ))}
      </aside>

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid var(--vela-border, rgba(255,255,255,0.07))',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            flex: 1, maxWidth: 320,
            background: 'var(--vela-bg-elevated, rgba(255,255,255,0.06))',
            border: '1px solid var(--vela-border, rgba(255,255,255,0.1))',
            borderRadius: 7, padding: '0 10px', height: 30,
          }}>
            <span style={{ color: 'var(--vela-fg-muted, rgba(255,255,255,0.35))', flexShrink: 0 }}>
              <IcoSearch />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar descargas…"
              style={{
                flex: 1, border: 'none', background: 'transparent',
                color: 'var(--vela-fg, #e0e0e0)', fontSize: 12, outline: 'none',
              }}
            />
          </div>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleClearCompleted}
            style={{
              padding: '0 12px', height: 30, borderRadius: 6,
              border: '1px solid var(--vela-border, rgba(255,255,255,0.12))',
              background: 'transparent', color: 'var(--vela-fg-secondary, rgba(255,255,255,0.55))',
              fontSize: 12, cursor: 'pointer',
            }}
          >
            Borrar completadas
          </button>
          <button
            onClick={openDownloadsFolder}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '0 12px', height: 30, borderRadius: 6,
              border: '1px solid var(--vela-border, rgba(255,255,255,0.12))',
              background: 'transparent', color: 'var(--vela-fg-secondary, rgba(255,255,255,0.55))',
              fontSize: 12, cursor: 'pointer',
            }}
          >
            <IcoExternalFolder />
            Carpeta de descargas
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {grouped.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '60%', gap: 8,
            }}>
              <div style={{ fontSize: 14, color: 'var(--vela-fg-muted, rgba(255,255,255,0.4))' }}>
                {query || activeCategory !== 'Todos los archivos'
                  ? 'Sin resultados'
                  : 'Las descargas de esta sesión aparecerán aquí.'}
              </div>
              {!query && activeCategory === 'Todos los archivos' && (
                <div style={{ fontSize: 12, color: 'var(--vela-fg-muted, rgba(255,255,255,0.3))' }}>
                  Las descargas no persisten entre sesiones de Vela.
                </div>
              )}
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.label}>
                <div style={{
                  fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: 'var(--vela-fg-muted, rgba(255,255,255,0.35))',
                  padding: '10px 16px 4px',
                  userSelect: 'none',
                }}>
                  {group.label}
                </div>
                {group.items.map((item) => (
                  <DownloadRowFull
                    key={item.id}
                    item={item}
                    onRemove={handleRemove}
                    onDeleteFile={handleDeleteFile}
                    onRefresh={refresh}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}

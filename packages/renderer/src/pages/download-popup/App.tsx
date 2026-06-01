import { useEffect, useState, type CSSProperties } from 'react';
import { IPC_EVENTS, type DownloadItem } from '@vela/shared';
import { getGlassStyle } from '../../lib/popupGlass';

const params = new URLSearchParams(window.location.search);
const parentWindowId = Number(params.get('windowId') ?? '0');

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]!}`;
}

function getOrigin(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function IcoFolder() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IcoPause() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}
function IcoPlay() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}
function IcoX() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IcoRefresh() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
function IcoFileDownload() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="12" y1="18" x2="12" y2="12" />
      <polyline points="9 15 12 18 15 15" />
    </svg>
  );
}

const btnStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 24, height: 24, borderRadius: 4, border: 'none',
  background: 'transparent', color: 'var(--vela-fg-muted, rgba(255,255,255,0.5))',
  cursor: 'pointer', flexShrink: 0, padding: 0,
};

function DownloadRow({ item, onRefresh }: { item: DownloadItem; onRefresh: () => void }) {
  const isActive = item.state === 'progressing';
  const isCompleted = item.state === 'completed';
  const pct = item.totalBytes > 0 ? Math.round((item.receivedBytes / item.totalBytes) * 100) : null;

  return (
    <div
      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', borderRadius: 6, cursor: isCompleted ? 'pointer' : 'default' }}
      onClick={isCompleted ? () => void window.api.downloads.openFile(item.savePath) : undefined}
    >
      <div style={{ flexShrink: 0, color: 'var(--vela-fg-muted, rgba(255,255,255,0.4))', paddingTop: 2 }}>
        <IcoFileDownload />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--vela-fg, #e0e0e0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.filename}
        </div>
        <div style={{ fontSize: 10, color: 'var(--vela-fg-muted, rgba(255,255,255,0.4))', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {getOrigin(item.url)}
        </div>

        {isActive && (
          <div style={{ marginTop: 4 }}>
            <div style={{ height: 3, background: 'var(--vela-border, rgba(255,255,255,0.1))', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: pct !== null ? `${pct}%` : '40%',
                background: item.paused ? 'var(--vela-fg-muted, rgba(255,255,255,0.3))' : 'var(--vela-accent, #4f8ef7)',
                borderRadius: 2,
                transition: 'width 300ms ease',
              } as CSSProperties} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--vela-fg-muted, rgba(255,255,255,0.4))' }}>
                {pct !== null ? `${formatBytes(item.receivedBytes)} / ${formatBytes(item.totalBytes)}` : formatBytes(item.receivedBytes)}
              </span>
              <div style={{ display: 'flex', gap: 2 }}>
                <button style={btnStyle} title={item.paused ? 'Reanudar' : 'Pausar'}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.08))'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                  onClick={() => {
                    const op = item.paused ? window.api.downloads.resume(item.id) : window.api.downloads.pause(item.id);
                    void op.then(onRefresh);
                  }}>
                  {item.paused ? <IcoPlay /> : <IcoPause />}
                </button>
                <button style={btnStyle} title="Cancelar"
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.08))'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                  onClick={() => void window.api.downloads.cancel(item.id).then(onRefresh)}>
                  <IcoX />
                </button>
              </div>
            </div>
          </div>
        )}

        {item.state === 'completed' && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--vela-fg-muted, rgba(255,255,255,0.4))' }}>
              Descarga terminada · {formatBytes(item.totalBytes || item.receivedBytes)}
            </span>
            <button style={btnStyle} title="Abrir carpeta"
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.08))'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              onClick={(e) => { e.stopPropagation(); void window.api.downloads.showInFolder(item.savePath); }}>
              <IcoFolder />
            </button>
          </div>
        )}

        {(item.state === 'cancelled' || item.state === 'interrupted') && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }}>
            <span style={{ fontSize: 10, color: 'rgba(239,68,68,0.7)' }}>
              {item.state === 'cancelled' ? 'Cancelada' : 'Interrumpida'}
            </span>
            <button style={btnStyle} title="Reintentar"
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.08))'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              onClick={() => void window.api.window.openUrlInNewTab({ url: item.url, activate: true })}>
              <IcoRefresh />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function App() {
  const [items, setItems] = useState<DownloadItem[]>([]);

  const refresh = () => {
    void window.api.downloads.getAll().then((res) => {
      if (res.ok) setItems(res.data);
    });
  };

  useEffect(() => {
    refresh();
    const off = window.api.on(IPC_EVENTS.DOWNLOADS_CHANGED, ({ items: next }) => {
      setItems(next);
    });
    return off;
  }, []);

  const activeItems = items.filter((d) => d.state === 'progressing');
  const visible = items.slice(0, 5);
  const hasMore = items.length > 5;
  const hasCompleted = items.some((d) => d.state !== 'progressing');

  const footerBtn: CSSProperties = {
    flex: 1, height: 28, borderRadius: 6,
    border: '1px solid var(--vela-border, rgba(255,255,255,0.12))',
    background: 'transparent', fontSize: 12, cursor: 'pointer',
  };

  return (
    <div style={{
      background: 'var(--vela-bg-surface, #1c1f26)',
      border: '1px solid var(--vela-border, rgba(255,255,255,0.09))',
      borderRadius: 10,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      ...getGlassStyle(),
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '10px 12px 8px',
        borderBottom: '1px solid var(--vela-border, rgba(255,255,255,0.07))',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--vela-fg, #e0e0e0)', flex: 1 }}>
          Descargas
        </span>
        {activeItems.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--vela-fg-muted, rgba(255,255,255,0.4))' }}>
            {activeItems.length} en progreso
          </span>
        )}
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 12, color: 'var(--vela-fg-muted, rgba(255,255,255,0.35))', flex: 1 }}>
          Sin descargas recientes
        </div>
      ) : (
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '4px 0' }}>
          {visible.map((item) => (
            <DownloadRow key={item.id} item={item} onRefresh={refresh} />
          ))}
          {hasMore && (
            <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--vela-fg-muted, rgba(255,255,255,0.35))' }}>
              +{items.length - 5} más — ver todo en Descargas
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: 'flex', gap: 6, padding: '8px 10px',
        borderTop: '1px solid var(--vela-border, rgba(255,255,255,0.07))',
        flexShrink: 0,
      }}>
        <button
          disabled={!hasCompleted}
          onClick={() => void window.api.downloads.clearCompleted().then(refresh)}
          style={{
            ...footerBtn,
            color: hasCompleted ? 'var(--vela-fg-secondary, rgba(255,255,255,0.6))' : 'var(--vela-fg-muted, rgba(255,255,255,0.25))',
            cursor: hasCompleted ? 'pointer' : 'default',
          } as CSSProperties}
        >
          Vaciar
        </button>
        <button
          onClick={() => {
            window.close();
            void window.api.commands.execute('internal.openDownloads', { targetWindowId: parentWindowId });
          }}
          style={{ ...footerBtn, color: 'var(--vela-fg-secondary, rgba(255,255,255,0.6))' } as CSSProperties}
        >
          Ver más
        </button>
      </div>
    </div>
  );
}

import type { RecentFile, DownloadFile } from '@vela/shared';

type FileEntry = Pick<RecentFile, 'name' | 'mimeType' | 'sizeBytes'> & { usedAt?: number; modifiedAt?: number };

interface Props {
  file: FileEntry;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${units[i]}`;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function mimeIcon(mime: string): string {
  if (mime.startsWith('image/')) return '🖼';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf') return '📄';
  if (mime.includes('zip') || mime.includes('compressed')) return '📦';
  if (mime.includes('text/') || mime.includes('document')) return '📝';
  if (mime.includes('spreadsheet') || mime.includes('excel')) return '📊';
  return '📎';
}

export function FileItem({ file, selected, onClick }: Props) {
  const ts = file.usedAt ?? file.modifiedAt ?? 0;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        padding: '7px 12px',
        border: 'none',
        borderRadius: '6px',
        background: selected ? 'var(--vela-selected)' : 'transparent',
        color: 'var(--vela-fg)',
        textAlign: 'left',
        transition: 'background 80ms',
        outline: selected ? '1px solid var(--vela-accent)' : 'none',
        outlineOffset: '-1px',
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = 'var(--vela-hover)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = selected ? 'var(--vela-selected)' : 'transparent';
      }}
    >
      <span style={{ fontSize: '20px', lineHeight: 1, flexShrink: 0 }}>
        {mimeIcon(file.mimeType)}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '13px',
          }}
        >
          {file.name}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: '11px',
            color: 'var(--vela-fg-muted)',
            marginTop: '1px',
          }}
        >
          {formatBytes(file.sizeBytes)}
          {ts > 0 && <> · {formatRelative(ts)}</>}
        </span>
      </span>
    </button>
  );
}

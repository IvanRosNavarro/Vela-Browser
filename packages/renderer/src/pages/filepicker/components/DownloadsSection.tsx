import { useEffect, useState } from 'react';
import type { DownloadFile } from '@vela/shared';
import { FileItem } from './FileItem';

interface Props {
  accept: string;
  multiple: boolean;
  selected: Set<string>;
  onToggle: (path: string) => void;
}

function matchesAccept(mime: string, name: string, accept: string): boolean {
  if (!accept) return true;
  return accept.split(',').some((token) => {
    const t = token.trim().toLowerCase();
    if (!t) return true;
    if (t.startsWith('.')) return name.toLowerCase().endsWith(t);
    if (t.endsWith('/*')) return mime.toLowerCase().startsWith(t.slice(0, -1));
    return mime.toLowerCase() === t;
  });
}

export function DownloadsSection({ accept, multiple, selected, onToggle }: Props) {
  const [files, setFiles] = useState<DownloadFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await window.api.filepicker.listDownloads({ limit: 20, accept });
      if (res.ok) setFiles(res.data);
      setLoading(false);
    })();
  }, [accept]);

  if (loading) return null;

  const visible = files.filter((f) => matchesAccept(f.mimeType, f.name, accept));
  if (visible.length === 0) return null;

  return (
    <section>
      <p
        style={{
          fontSize: '10px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--vela-fg-muted)',
          padding: '8px 12px 4px',
        }}
      >
        Descargas recientes
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        {visible.slice(0, 5).map((f) => (
          <FileItem
            key={f.path}
            file={{ ...f, usedAt: f.modifiedAt }}
            selected={selected.has(f.path)}
            onClick={(e) => {
              if (multiple && e.ctrlKey) {
                onToggle(f.path);
              } else {
                onToggle(f.path);
              }
            }}
          />
        ))}
      </div>
    </section>
  );
}

import { useEffect, useState } from 'react';
import type { RecentFile } from '@vela/shared';
import { FileItem } from './FileItem';

interface Props {
  profileId: string;
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

export function RecentSection({ profileId, accept, multiple, selected, onToggle }: Props) {
  const [files, setFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileId) return;
    void (async () => {
      const res = await window.api.filepicker.listRecent({ profileId, limit: 20, accept });
      if (res.ok) setFiles(res.data);
      setLoading(false);
    })();
  }, [profileId, accept]);

  const visible = files.filter((f) => matchesAccept(f.mimeType, f.name, accept));

  if (loading) {
    return (
      <section style={{ padding: '8px 12px' }}>
        <SectionHeader>Recientes</SectionHeader>
        <p style={{ fontSize: '12px', color: 'var(--vela-fg-muted)', padding: '4px 0' }}>Cargando…</p>
      </section>
    );
  }

  return (
    <section>
      <SectionHeader>Recientes</SectionHeader>
      {visible.length === 0 ? (
        <p style={{ fontSize: '12px', color: 'var(--vela-fg-muted)', padding: '4px 12px 8px' }}>
          No hay archivos recientes{accept ? ' de este tipo' : ''}.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {visible.slice(0, 10).map((f) => (
            <FileItem
              key={f.id}
              file={f}
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
      )}
    </section>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
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
      {children}
    </p>
  );
}

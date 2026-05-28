import { useEffect, useRef, useState } from 'react';
import type { Favorite } from '@vela/shared';

interface FavoriteEditorProps {
  item: Favorite;
  onSave: (data: { title: string; url?: string }) => void;
  onCancel: () => void;
}

export function FavoriteEditor({ item, onSave, onCancel }: FavoriteEditorProps) {
  const [title, setTitle] = useState(item.title);
  const [url, setUrl] = useState(item.url ?? '');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); titleRef.current?.select(); }, []);

  function handleSave() {
    const trimmedTitle = title.trim() || item.title;
    const trimmedUrl = url.trim() || (item.url ?? undefined);
    onSave({ title: trimmedTitle, url: item.type === 'bookmark' ? trimmedUrl : undefined });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleSave(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 34,
    padding: '0 10px',
    borderRadius: 6,
    border: '1px solid var(--vela-addressbar-border)',
    background: 'var(--vela-bg-app)',
    color: 'var(--vela-fg)',
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--vela-fg-muted)',
    marginBottom: 4,
    display: 'block',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        style={{ background: 'var(--vela-bg-surface)', borderRadius: 10, padding: 24, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 16 }}
        onKeyDown={handleKeyDown}
      >
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
          {item.type === 'folder' ? 'Editar carpeta' : 'Editar favorito'}
        </h2>

        <div>
          <label style={labelStyle}>Nombre</label>
          <input ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </div>

        {item.type === 'bookmark' && (
          <div>
            <label style={labelStyle}>URL</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} style={inputStyle} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid var(--vela-border)', background: 'transparent', color: 'var(--vela-fg)', fontSize: 13, cursor: 'default' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: 'var(--vela-accent)', color: '#fff', fontSize: 13, cursor: 'default', fontWeight: 500 }}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

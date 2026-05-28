import { useState } from 'react';

type RunAt = 'document-start' | 'document-end' | 'document-idle';

interface ImportedMeta {
  name: string;
  description: string;
  code: string;
  matchPatterns: string[];
  runAt: RunAt;
}

interface Props {
  onReady: (meta: ImportedMeta) => void;
  onCancel: () => void;
}

export function ScriptImporter({ onReady, onCancel }: Props) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportedMeta | null>(null);

  async function handleFetch() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    const res = await window.api.scripts.importUrl({ url: url.trim() });
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? 'Error desconocido');
      return;
    }
    setPreview(res.data);
  }

  function handleInstall() {
    if (preview) onReady(preview);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--vela-bg-input)',
    border: '1px solid var(--vela-border)',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 13,
    color: 'var(--vela-fg)',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflow: 'auto' }}>
      <div
        style={{
          background: '#7c3aed22',
          border: '1px solid #7c3aed44',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 12,
          color: 'var(--vela-fg)',
        }}
      >
        ⚠ Revisa el código antes de instalar. Los scripts tienen acceso al DOM y al JS de las páginas.
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>URL del archivo .user.js</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://greasyfork.org/scripts/…/code/script.user.js"
            style={{ ...inputStyle, flex: 1 }}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleFetch(); }}
          />
          <button
            onClick={() => void handleFetch()}
            disabled={loading || !url.trim()}
            style={{
              background: 'var(--vela-accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 16px',
              fontSize: 13,
              cursor: loading ? 'wait' : 'pointer',
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? 'Descargando…' : 'Descargar y previsualizar'}
          </button>
        </div>
      </label>

      {error && (
        <div style={{ fontSize: 12, color: '#f87171', padding: '8px 12px', background: '#7f1d1d22', borderRadius: 6 }}>
          ✗ {error}
        </div>
      )}

      {preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{preview.name}</div>
            {preview.description && <div style={{ fontSize: 13, color: 'var(--vela-fg-muted)' }}>{preview.description}</div>}
            <div style={{ fontSize: 12, color: 'var(--vela-fg-muted)' }}>
              Patrones: {preview.matchPatterns.join(', ')} • Ejecutar en: {preview.runAt}
            </div>
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <span style={{ fontSize: 12, fontWeight: 500 }}>Código completo</span>
            <textarea
              value={preview.code}
              readOnly
              rows={12}
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
            />
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onCancel}
              style={{
                background: 'none',
                border: '1px solid var(--vela-border)',
                color: 'var(--vela-fg)',
                borderRadius: 6,
                padding: '7px 14px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleInstall}
              style={{
                background: 'var(--vela-accent)',
                border: 'none',
                color: '#fff',
                borderRadius: 6,
                padding: '7px 16px',
                fontSize: 13,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Instalar script
            </button>
          </div>
        </div>
      )}

      {!preview && (
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: '1px solid var(--vela-border)',
              color: 'var(--vela-fg)',
              borderRadius: 6,
              padding: '7px 14px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

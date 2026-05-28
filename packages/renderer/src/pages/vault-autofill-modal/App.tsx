import { useCallback, useEffect, useState } from 'react';
import type { VaultEntry } from '@vela/shared';
import { getGlassStyle } from '../../lib/popupGlass';

const params = new URLSearchParams(window.location.search);
// windowId aquí es el ID del main window (la ventana padre), no de esta modal
const windowId = parseInt(params.get('windowId') ?? '0', 10);
const tabId = params.get('tabId') ?? '';
const domain = params.get('domain') ?? '';

export function App() {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filling, setFilling] = useState<string | null>(null);

  useEffect(() => {
    void window.api.vault.getForDomain({ domain }).then((res) => {
      if (res.ok) setEntries(res.data);
      setLoading(false);
    });
  }, []);

  const handleFill = useCallback(async (entry: VaultEntry) => {
    setFilling(entry.id);
    await window.api.vault.fill({ tabId, username: entry.username, password: entry.password });
    await window.api.vault.markUsed({ id: entry.id });
    await window.api.vault.closeAutofillModal({ windowId });
  }, []);

  const handleOpenManager = useCallback(async () => {
    // vault:open-manager abre vela://passwords en el main window y cierra esta modal
    await window.api.vault.openManager({ windowId });
  }, []);

  const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--vela-bg-surface)', borderRadius: 'var(--vela-radius)' }}>
        <span style={{ fontSize: 12, color: 'var(--vela-fg-muted)' }}>Cargando…</span>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--vela-bg-surface)',
      borderRadius: 'var(--vela-radius)',
      border: '1px solid var(--vela-border)',
      overflow: 'hidden',
      ...getGlassStyle(),
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid var(--vela-border)' }}>
        <img
          src={favicon}
          width={14}
          height={14}
          style={{ borderRadius: 3, flexShrink: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          alt=""
        />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--vela-fg)' }}>
          Credenciales para {domain}
        </span>
      </div>

      {/* Entries */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {entries.length === 0 ? (
          <div style={{ padding: '16px 12px', textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--vela-fg-muted)' }}>Sin credenciales guardadas</p>
          </div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderBottom: '1px solid var(--vela-border)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--vela-fg)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.username}
                </div>
                <div style={{ fontSize: 10, color: 'var(--vela-fg-muted)', marginTop: 1 }}>
                  {entry.folder}
                </div>
              </div>
              <button
                type="button"
                onMouseDown={(e) => {
                  // Prevent blur from firing on the window before the click completes
                  e.preventDefault();
                }}
                onClick={() => void handleFill(entry)}
                disabled={filling !== null}
                style={{
                  background: 'var(--vela-accent)',
                  border: 'none',
                  borderRadius: 5,
                  color: '#fff',
                  fontSize: 11,
                  padding: '4px 10px',
                  cursor: filling !== null ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                  flexShrink: 0,
                  opacity: filling === entry.id ? 0.6 : 1,
                }}
              >
                {filling === entry.id ? 'Rellenando…' : 'Rellenar'}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--vela-border)', textAlign: 'center' }}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); }}
          onClick={() => void handleOpenManager()}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--vela-accent)',
            fontSize: 11,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Gestionar contraseñas →
        </button>
      </div>
    </div>
  );
}

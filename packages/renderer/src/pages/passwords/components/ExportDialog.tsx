import { useState, useCallback, type CSSProperties, type FormEvent } from 'react';

interface Props {
  onCancel: () => void;
  onConfirm: (protectionPassword: string) => Promise<void>;
}

const MIN_LENGTH = 8;

/**
 * Pide la contraseña con la que se cifra el fichero exportado.
 *
 * Es un modal propio y no `window.prompt`: Electron no implementa `prompt`
 * (lanza «prompt() is and will not be supported»), así que la exportación
 * moría antes de llegar al IPC.
 */
export function ExportDialog({ onCancel, onConfirm }: Props) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < MIN_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmation) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onConfirm(password);
    } finally {
      setBusy(false);
    }
  }, [busy, password, confirmation, onConfirm]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        style={{
          width: 360,
          background: 'var(--vela-bg-surface)',
          border: '1px solid var(--vela-border)',
          borderRadius: 10,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--vela-fg)' }}>
          Exportar contraseñas
        </h2>
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--vela-fg-muted)' }}>
          El fichero se cifra con esta contraseña. Si la pierdes no hay forma de
          recuperar su contenido.
        </p>

        <input
          type="password"
          autoFocus
          placeholder="Contraseña de protección"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Repite la contraseña"
          value={confirmation}
          onChange={(e) => { setConfirmation(e.target.value); setError(null); }}
          style={inputStyle}
        />

        {error && (
          <p style={{ margin: 0, fontSize: 11, color: 'var(--vela-danger, #e5484d)' }}>{error}</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button type="button" onClick={onCancel} disabled={busy} style={btnStyle}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy}
            style={{
              ...btnStyle,
              background: 'var(--vela-accent)',
              border: 'none',
              color: '#fff',
              fontWeight: 500,
            }}
          >
            {busy ? 'Exportando…' : 'Exportar'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputStyle: CSSProperties = {
  background: 'var(--vela-bg)',
  border: '1px solid var(--vela-border)',
  borderRadius: 6,
  color: 'var(--vela-fg)',
  padding: '6px 10px',
  outline: 'none',
  fontSize: 12,
};

const btnStyle: CSSProperties = {
  background: 'var(--vela-bg)',
  border: '1px solid var(--vela-border)',
  borderRadius: 6,
  color: 'var(--vela-fg)',
  fontSize: 12,
  padding: '5px 12px',
  cursor: 'pointer',
};

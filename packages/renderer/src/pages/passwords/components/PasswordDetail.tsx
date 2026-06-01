import { useState, useCallback, useEffect } from 'react';
import type { VaultEntry } from '@vela/shared';
import { useRuntimeStore } from '../../../stores/runtimeStore';
import { writeToClipboard } from '../../../lib/clipboard';

interface Props {
  entry: VaultEntry;
  onUpdate: (id: string, patch: Partial<VaultEntry>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function PasswordDetail({ entry, onUpdate, onDelete }: Props) {
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const [showPassword, setShowPassword] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editingId, setEditingId] = useState(entry.id);
  const [username, setUsername] = useState(entry.username);
  const [password, setPassword] = useState(entry.password);
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [folder, setFolder] = useState(entry.folder);
  const [copyMsg, setCopyMsg] = useState('');

  // Reset fields when switching to a different entry
  useEffect(() => {
    if (entry.id === editingId) return;
    setEditingId(entry.id);
    setUsername(entry.username);
    setPassword(entry.password);
    setNotes(entry.notes ?? '');
    setFolder(entry.folder);
    setEditing(false);
    setShowPassword(false);
  }, [entry, editingId]);

  const handleSave = useCallback(async () => {
    await onUpdate(entry.id, { username, password, notes: notes || null, folder });
    setEditing(false);
  }, [entry.id, username, password, notes, folder, onUpdate]);

  const handleCopyPassword = useCallback(async () => {
    await writeToClipboard(entry.password);
    setCopyMsg('¡Copiado!');
    setTimeout(() => setCopyMsg(''), 2000);
    setTimeout(() => { void writeToClipboard(''); }, 30_000);
  }, [entry.password]);

  const handleOpenAndFill = useCallback(async () => {
    if (!currentWindowId || !entry.loginUrl) return;
    await window.api.vault.openAndFill({
      windowId: currentWindowId,
      loginUrl: entry.loginUrl,
      username: entry.username,
      password: entry.password,
    });
  }, [currentWindowId, entry.loginUrl, entry.username, entry.password]);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <img
          src={`https://www.google.com/s2/favicons?domain=${entry.domain}&sz=32`}
          width={24}
          height={24}
          style={{ borderRadius: 4 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          alt=""
        />
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--vela-fg)', flex: 1 }}>{entry.domain}</h2>
        {!editing ? (
          <button type="button" onClick={() => setEditing(true)} style={btnSecStyle}>Editar</button>
        ) : (
          <>
            <button type="button" onClick={() => void handleSave()} style={btnPriStyle}>Guardar</button>
            <button type="button" onClick={() => setEditing(false)} style={btnSecStyle}>Cancelar</button>
          </>
        )}
      </div>

      <Field label="Usuario">
        {editing ? (
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} />
        ) : (
          <span style={valueStyle}>{entry.username}</span>
        )}
      </Field>

      <Field label="Contraseña">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
          {editing ? (
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
          ) : (
            <span style={{ ...valueStyle, fontFamily: showPassword ? 'inherit' : 'monospace', letterSpacing: showPassword ? 'normal' : '0.15em' }}>
              {showPassword ? entry.password : '••••••••••'}
            </span>
          )}
          <button type="button" onClick={() => setShowPassword(!showPassword)} style={iconBtnStyle} title={showPassword ? 'Ocultar' : 'Mostrar'}>
            {showPassword ? '🙈' : '👁'}
          </button>
          <button type="button" onClick={() => void handleCopyPassword()} style={iconBtnStyle} title="Copiar contraseña">
            {copyMsg || '📋'}
          </button>
        </div>
      </Field>

      <Field label="URL de login">
        <span style={{ ...valueStyle, color: 'var(--vela-accent)', textDecoration: entry.loginUrl ? 'underline' : 'none', cursor: entry.loginUrl ? 'pointer' : 'default' }}>
          {entry.loginUrl ?? '—'}
        </span>
      </Field>

      <Field label="Carpeta">
        {editing ? (
          <input type="text" value={folder} onChange={(e) => setFolder(e.target.value)} style={inputStyle} />
        ) : (
          <span style={valueStyle}>{entry.folder}</span>
        )}
      </Field>

      <Field label="Notas">
        {editing ? (
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', width: '100%' }}
          />
        ) : (
          <span style={{ ...valueStyle, whiteSpace: 'pre-wrap' }}>{entry.notes ?? '—'}</span>
        )}
      </Field>

      <Field label="Última modificación">
        <span style={valueStyle}>{new Date(entry.updatedAt).toLocaleString('es-ES')}</span>
      </Field>

      {entry.lastUsedAt && (
        <Field label="Último uso">
          <span style={valueStyle}>{new Date(entry.lastUsedAt).toLocaleString('es-ES')}</span>
        </Field>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--vela-border)' }}>
        <button
          type="button"
          onClick={() => void handleOpenAndFill()}
          style={entry.loginUrl ? btnSecStyle : { ...btnSecStyle, opacity: 0.4, cursor: 'not-allowed' }}
          disabled={!entry.loginUrl}
          title={entry.loginUrl ? 'Abre la URL de login en una nueva pestaña y rellena automáticamente' : 'Este registro no tiene URL de login'}
        >
          🔑 Abrir en nueva pestaña
        </button>
        <button
          type="button"
          onClick={() => void onDelete(entry.id)}
          style={{ ...btnSecStyle, color: 'var(--vela-danger)', borderColor: 'var(--vela-danger)' }}
        >
          🗑 Eliminar
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
      <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)', width: 100, flexShrink: 0, paddingTop: 4, textAlign: 'right' }}>{label}</span>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>{children}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--vela-bg-elevated)',
  border: '1px solid var(--vela-border)',
  borderRadius: 5,
  color: 'var(--vela-fg)',
  fontSize: 12,
  padding: '4px 8px',
  outline: 'none',
  flex: 1,
};

const valueStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--vela-fg)',
};

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  padding: 2,
  flexShrink: 0,
};

const btnSecStyle: React.CSSProperties = {
  background: 'var(--vela-bg-elevated)',
  border: '1px solid var(--vela-border)',
  borderRadius: 6,
  color: 'var(--vela-fg)',
  fontSize: 11,
  padding: '5px 12px',
  cursor: 'pointer',
};

const btnPriStyle: React.CSSProperties = {
  background: 'var(--vela-accent)',
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  fontSize: 11,
  padding: '5px 12px',
  cursor: 'pointer',
  fontWeight: 500,
};

import { useState, useCallback } from 'react';
import type { VaultSaveInput } from '@vela/shared';
import { PasswordGenerator } from './PasswordGenerator';

interface Props {
  folders: string[];
  onCreate: (input: VaultSaveInput) => Promise<void>;
  onCancel: () => void;
}

export function NewEntryForm({ folders, onCreate, onCancel }: Props) {
  const [domain, setDomain] = useState('');
  const [loginUrl, setLoginUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [folder, setFolder] = useState(folders[0] ?? 'General');
  const [notes, setNotes] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!domain.trim()) { setError('El dominio es obligatorio'); return; }
    if (!username.trim()) { setError('El usuario es obligatorio'); return; }
    if (!password) { setError('La contraseña es obligatoria'); return; }
    setError('');
    setSaving(true);
    await onCreate({
      domain: domain.trim(),
      loginUrl: loginUrl.trim(),
      username: username.trim(),
      password,
      folder: folder.trim() || 'General',
      notes: notes.trim() || undefined,
    });
    setSaving(false);
  }, [domain, loginUrl, username, password, folder, notes, onCreate]);

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {showGenerator && (
        <PasswordGenerator onUsePassword={(pwd) => {
          setPassword(pwd);
          setShowGenerator(false);
        }} />
      )}

      <div style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--vela-fg)', flex: 1, margin: 0 }}>
            Nueva contraseña
          </h2>
          <button type="button" onClick={() => void handleSave()} style={btnPriStyle} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" onClick={onCancel} style={btnSecStyle}>Cancelar</button>
        </div>

        {error && (
          <p style={{ color: 'var(--vela-danger, #e05555)', fontSize: 12, marginBottom: 12, marginTop: -8 }}>
            {error}
          </p>
        )}

        <Field label="Dominio">
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            style={inputStyle}
            placeholder="ejemplo.com"
            autoFocus
          />
        </Field>

        <Field label="URL de login">
          <input
            type="text"
            value={loginUrl}
            onChange={(e) => setLoginUrl(e.target.value)}
            style={inputStyle}
            placeholder="https://ejemplo.com/login"
          />
        </Field>

        <Field label="Usuario">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={inputStyle}
            placeholder="usuario@ejemplo.com"
          />
        </Field>

        <Field label="Contraseña">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={iconBtnStyle}
              title={showPassword ? 'Ocultar' : 'Mostrar'}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
            <button
              type="button"
              onClick={() => setShowGenerator(!showGenerator)}
              style={iconBtnStyle}
              title="Generador de contraseñas"
            >
              🎲
            </button>
          </div>
        </Field>

        <Field label="Carpeta">
          <input
            type="text"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            style={inputStyle}
            placeholder="General"
            list="new-entry-folder-list"
          />
          <datalist id="new-entry-folder-list">
            {folders.map((f) => <option key={f} value={f} />)}
          </datalist>
        </Field>

        <Field label="Notas">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical', width: '100%' }}
            placeholder="Notas opcionales…"
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
      <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)', width: 100, flexShrink: 0, paddingTop: 4, textAlign: 'right' }}>
        {label}
      </span>
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

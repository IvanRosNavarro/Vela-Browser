import { useState, useEffect, useCallback } from 'react';
import { getGlassStyle } from '../../lib/popupGlass';

const params = new URLSearchParams(window.location.search);
const windowId = parseInt(params.get('windowId') ?? '0', 10);
const domain = params.get('domain') ?? '';
const loginUrl = params.get('loginUrl') ?? '';
const username = params.get('username') ?? '';
const initialPassword = params.get('password') ?? '';
const hasExisting = params.get('hasExisting') === 'true';
const existingId = params.get('existingId') ?? null;

export function App() {
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState(initialPassword);
  const [currentUsername, setCurrentUsername] = useState(username);
  const [folder, setFolder] = useState('General');
  const [folders, setFolders] = useState<string[]>(['General']);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void window.api.vault.listFolders().then((res) => {
      if (res.ok && res.data.length > 0) setFolders(res.data);
    });
    // Get the password from the pending credentials — it's not in URL params for security
    // The password is retrieved from the pending state in main via a dedicated handler
    // For now we leave it empty and let the user see the save UI
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    if (hasExisting && existingId) {
      await window.api.vault.update({ id: existingId, username: currentUsername, password: password || undefined });
    } else {
      await window.api.vault.save({ domain, loginUrl, username: currentUsername, password, folder });
    }
    await window.api.vault.closeSaveModal({ windowId });
  }, [currentUsername, password, folder, hasExisting, existingId]);

  const handleDismiss = useCallback(async () => {
    await window.api.vault.closeSaveModal({ windowId });
  }, []);

  const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--vela-bg-surface)',
      borderRadius: 'var(--vela-radius)',
      border: '1px solid var(--vela-border)',
      padding: '12px 14px',
      gap: 8,
      ...getGlassStyle(),
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img
          src={favicon}
          width={16}
          height={16}
          style={{ borderRadius: 3, flexShrink: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          alt=""
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--vela-fg)', flexShrink: 0 }}>
          {hasExisting ? 'Actualizar contraseña' : 'Guardar contraseña'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {domain}
        </span>
      </div>

      {/* Username */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ fontSize: 11, color: 'var(--vela-fg-muted)', width: 60, flexShrink: 0 }}>Usuario</label>
        <input
          type="text"
          value={currentUsername}
          onChange={(e) => setCurrentUsername(e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Password */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ fontSize: 11, color: 'var(--vela-fg-muted)', width: 60, flexShrink: 0 }}>Contraseña</label>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}

            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            style={iconBtnStyle}
            title={showPassword ? 'Ocultar' : 'Mostrar'}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      {/* Folder */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ fontSize: 11, color: 'var(--vela-fg-muted)', width: 60, flexShrink: 0 }}>Carpeta</label>
        <select
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        >
          {folders.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 2 }}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); }}
          onClick={() => void handleDismiss()}
          style={btnSecondaryStyle}
        >
          No guardar
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); }}
          onClick={() => void handleSave()}
          disabled={saving}
          style={btnPrimaryStyle}
        >
          {hasExisting ? 'Actualizar' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--vela-bg)',
  border: '1px solid var(--vela-border)',
  borderRadius: 5,
  color: 'var(--vela-fg)',
  fontSize: 11,
  padding: '3px 6px',
  outline: 'none',
  fontFamily: 'inherit',
};

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  padding: 2,
  lineHeight: 1,
  flexShrink: 0,
};

const btnSecondaryStyle: React.CSSProperties = {
  background: 'var(--vela-bg)',
  border: '1px solid var(--vela-border)',
  borderRadius: 5,
  color: 'var(--vela-fg-muted)',
  fontSize: 11,
  padding: '4px 10px',
  cursor: 'pointer',
};

const btnPrimaryStyle: React.CSSProperties = {
  background: 'var(--vela-accent)',
  border: 'none',
  borderRadius: 5,
  color: '#fff',
  fontSize: 11,
  padding: '4px 12px',
  cursor: 'pointer',
  fontWeight: 500,
};

import { useState } from 'react';
import type { ElectronCookie, CookieSetData } from '@vela/shared';

type SameSite = 'unspecified' | 'no_restriction' | 'lax' | 'strict';

function toDatetimeLocal(exp?: number): string {
  if (!exp) return '';
  const d = new Date(exp * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(s: string): number | undefined {
  if (!s) return undefined;
  const ts = new Date(s).getTime();
  return isNaN(ts) ? undefined : ts / 1000;
}

interface CookieDetailProps {
  url: string;
  cookie: ElectronCookie;
  onSaved: () => void;
  onCancel: () => void;
  onDeleted: () => void;
}

export function CookieDetail({ url, cookie, onSaved, onCancel, onDeleted }: CookieDetailProps) {
  const [name, setName] = useState(cookie.name);
  const [value, setValue] = useState(cookie.value);
  const [domain, setDomain] = useState(cookie.domain);
  const [path, setPath] = useState(cookie.path ?? '/');
  const [hasExpiry, setHasExpiry] = useState(!!cookie.expirationDate);
  const [expiry, setExpiry] = useState(toDatetimeLocal(cookie.expirationDate));
  const [httpOnly, setHttpOnly] = useState(cookie.httpOnly);
  const [secure, setSecure] = useState(cookie.secure);
  const [sameSite, setSameSite] = useState<SameSite>(cookie.sameSite ?? 'unspecified');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const data: CookieSetData = {
      url,
      name: name.trim(),
      value,
      domain: domain || undefined,
      path: path || '/',
      httpOnly,
      secure,
      sameSite,
      ...(hasExpiry ? { expirationDate: fromDatetimeLocal(expiry) } : {}),
    };
    const res = await window.api.cookies.set(data);
    setSaving(false);
    if (res.ok) {
      onSaved();
    } else {
      const msg = typeof res.details === 'string' ? res.details : res.error;
      setError(msg ?? 'Error desconocido');
    }
  }

  async function handleDelete() {
    const scheme = cookie.secure ? 'https' : 'http';
    const d = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
    const cookieUrl = `${scheme}://${d}${cookie.path ?? '/'}`;
    await window.api.cookies.remove(cookieUrl, cookie.name);
    onDeleted();
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--vela-bg-surface)',
    border: '1px solid var(--vela-border)',
    borderRadius: 5, padding: '3px 7px',
    fontSize: 12, color: 'var(--vela-fg)', outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: 'var(--vela-fg-muted)', marginBottom: 2, display: 'block',
  };

  return (
    <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--vela-border)', background: 'var(--vela-bg-surface)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <label style={labelStyle}>Nombre *</label>
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Valor *</label>
          <input style={inputStyle} value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Dominio</label>
          <input style={inputStyle} value={domain} onChange={(e) => setDomain(e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Path</label>
          <input style={inputStyle} value={path} onChange={(e) => setPath(e.target.value)} />
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={hasExpiry} onChange={(e) => setHasExpiry(e.target.checked)} />
          Expiración fija
        </label>
        {hasExpiry && (
          <input type="datetime-local" style={{ ...inputStyle, marginTop: 4 }} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input type="checkbox" checked={httpOnly} onChange={(e) => setHttpOnly(e.target.checked)} />
          HttpOnly
        </label>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
          <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
          Secure
        </label>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
          SameSite:
          <select
            value={sameSite}
            onChange={(e) => setSameSite(e.target.value as SameSite)}
            style={{ fontSize: 12, background: 'var(--vela-bg-surface)', border: '1px solid var(--vela-border)', borderRadius: 4, color: 'var(--vela-fg)', padding: '1px 4px' }}
          >
            <option value="unspecified">None</option>
            <option value="lax">Lax</option>
            <option value="strict">Strict</option>
          </select>
        </label>
      </div>

      {error && (
        <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 6 }}>
          Error al guardar: {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => void handleSave()}
          disabled={saving || !name.trim()}
          style={{ flex: 1, fontSize: 12, borderRadius: 5, border: 'none', background: 'var(--vela-accent)', color: '#fff', cursor: 'pointer', padding: '4px 0', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          onClick={onCancel}
          style={{ flex: 1, fontSize: 12, borderRadius: 5, border: '1px solid var(--vela-border)', background: 'transparent', color: 'var(--vela-fg)', cursor: 'pointer', padding: '4px 0' }}
        >
          Cancelar
        </button>
        <button
          onClick={() => void handleDelete()}
          style={{ fontSize: 12, borderRadius: 5, border: '1px solid var(--vela-border)', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px 8px' }}
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}

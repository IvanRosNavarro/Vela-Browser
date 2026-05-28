import { useState } from 'react';
import type { ElectronCookie } from '@vela/shared';
import { CookieDetail } from './CookieDetail';

function relativeExpiry(exp?: number): string {
  if (!exp) return 'sesión';
  const diff = exp * 1000 - Date.now();
  if (diff < 0) return 'caducada';
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'caduca hoy';
  if (days === 1) return 'caduca mañana';
  return `caduca en ${days} días`;
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
    </svg>
  );
}

interface CookieRowProps {
  url: string;
  cookie: ElectronCookie;
  onReload: () => void;
}

export function CookieRow({ url, cookie, onReload }: CookieRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    const scheme = cookie.secure ? 'https' : 'http';
    const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
    const cookieUrl = `${scheme}://${domain}${cookie.path ?? '/'}`;
    await window.api.cookies.remove(cookieUrl, cookie.name);
    onReload();
  }

  if (expanded) {
    return (
      <CookieDetail
        url={url}
        cookie={cookie}
        onSaved={() => { setExpanded(false); onReload(); }}
        onCancel={() => setExpanded(false)}
        onDeleted={() => { setExpanded(false); onReload(); }}
      />
    );
  }

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 12px',
        borderBottom: '1px solid var(--vela-border)',
        cursor: 'pointer',
        background: hovered ? 'var(--vela-bg-surface)' : 'transparent',
      }}
      onClick={() => setExpanded(true)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cookie.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--vela-fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cookie.value.length > 40 ? cookie.value.slice(0, 40) + '…' : cookie.value}
        </div>
        <div style={{ fontSize: 11, color: 'var(--vela-fg-muted)' }}>
          {relativeExpiry(cookie.expirationDate)}
          {cookie.domain !== (url ? (() => { try { return new URL(url).hostname; } catch { return ''; } })() : '') && (
            <span style={{ marginLeft: 6, opacity: 0.7 }}>{cookie.domain}</span>
          )}
        </div>
      </div>
      {hovered && (
        <button
          title="Eliminar"
          onClick={(e) => void handleDelete(e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vela-fg-muted)', padding: 2, flexShrink: 0, display: 'flex' }}
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}

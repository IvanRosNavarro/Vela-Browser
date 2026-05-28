import { useEffect, useMemo, useState } from 'react';

function parseParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    url: p.get('url') ?? '',
    windowId: parseInt(p.get('windowId') ?? '0', 10),
  };
}

function getDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function getFaviconUrl(url: string): string {
  try { return `${new URL(url).origin}/favicon.ico`; } catch { return ''; }
}

// ── Icon components ───────────────────────────────────────────────────────────

function IconOpenTab() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2.5 11.5L11.5 2.5M11.5 2.5H6.5M11.5 2.5V7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconSplit() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1.5" y="2" width="4.5" height="10" rx="1" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="8" y="2" width="4.5" height="10" rx="1" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function App() {
  const { url, windowId } = useMemo(() => parseParams(), []);
  const [faviconError, setFaviconError] = useState(false);

  const domain = useMemo(() => getDomain(url), [url]);
  const faviconSrc = faviconError ? null : getFaviconUrl(url);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void window.api.glance.close();
      if (e.key === 'Enter' && !e.shiftKey) void window.api.glance.openInTab({ url, windowId });
      if (e.key === 'Enter' && e.shiftKey) void window.api.glance.openInSplit({ url, windowId });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [url, windowId]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        height: 38,
        padding: '0 8px',
        background: 'var(--vela-titlebar-bg)',
        borderBottom: '1px solid var(--vela-border)',
        WebkitAppRegion: 'drag',
        overflow: 'hidden',
        flexShrink: 0,
      } as React.CSSProperties}
    >
      {/* Favicon */}
      {faviconSrc && (
        <img
          src={faviconSrc}
          width={14}
          height={14}
          style={{ flexShrink: 0, opacity: 0.75, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onError={() => setFaviconError(true)}
          alt=""
        />
      )}

      {/* Domain — takes remaining space */}
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--vela-fg-muted)',
          minWidth: 0,
        }}
        title={url}
      >
        {domain}
      </span>

      {/* Divider */}
      <div style={{ width: 1, height: 16, background: 'var(--vela-border)', flexShrink: 0 }} />

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        <button
          className="glance-btn"
          onClick={() => void window.api.glance.openInTab({ url, windowId })}
          title="Abrir en pestaña (Enter)"
        >
          <IconOpenTab />
        </button>
        <button
          className="glance-btn"
          onClick={() => void window.api.glance.openInSplit({ url, windowId })}
          title="Abrir en split (Shift+Enter)"
        >
          <IconSplit />
        </button>
        <button
          className="glance-btn glance-btn-close"
          onClick={() => void window.api.glance.close()}
          title="Cerrar (Escape)"
        >
          <IconClose />
        </button>
      </div>
    </div>
  );
}

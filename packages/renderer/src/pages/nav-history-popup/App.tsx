import { useCallback, useEffect, useMemo, useState } from 'react';
import { getGlassStyle } from '../../lib/popupGlass';
import type { NavHistoryEntry } from '@vela/shared';

const params = new URLSearchParams(window.location.search);
const parentWindowId = parseInt(params.get('windowId') ?? '0', 10);
const direction = (params.get('direction') === 'forward' ? 'forward' : 'back') as 'back' | 'forward';

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

function faviconFor(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.host}/favicon.ico`;
  } catch {
    return null;
  }
}

interface RowProps {
  entry: NavHistoryEntry;
  onClick: () => void;
}

function HistoryRow({ entry, onClick }: RowProps) {
  const [iconError, setIconError] = useState(false);
  const favicon = faviconFor(entry.url);
  const host = hostnameOf(entry.url);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        height: 34,
        flexShrink: 0,
        padding: '0 10px',
        background: 'none',
        border: 'none',
        borderRadius: 6,
        textAlign: 'left',
        color: 'var(--vela-fg, #e6e8ee)',
        cursor: 'pointer',
        minWidth: 0,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.06))'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
    >
      {favicon && !iconError ? (
        <img
          src={favicon}
          alt=""
          width={16}
          height={16}
          style={{ flexShrink: 0, borderRadius: 3 }}
          onError={() => setIconError(true)}
        />
      ) : (
        <span
          aria-hidden
          style={{
            width: 16, height: 16, flexShrink: 0, borderRadius: 3,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--vela-bg-elevated, #22252e)',
            color: 'var(--vela-fg-muted, #8c93a3)', fontSize: 10, fontWeight: 700,
          }}
        >
          {host.charAt(0).toUpperCase()}
        </span>
      )}
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, lineHeight: '15px' }}>
          {entry.title}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, lineHeight: '13px', color: 'var(--vela-fg-muted, #8c93a3)' }}>
          {host}
        </span>
      </span>
    </button>
  );
}

export function App() {
  const [entries, setEntries] = useState<NavHistoryEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    void window.api.navHistory.get({ windowId: parentWindowId }).then((res) => {
      if (res.ok) {
        setEntries(res.data.entries);
        setActiveIndex(res.data.activeIndex);
      }
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Atrás: entradas anteriores a la actual, la más reciente arriba.
  // Adelante: entradas posteriores a la actual, en orden de avance.
  const visible = useMemo(() => {
    if (activeIndex < 0) return [];
    if (direction === 'back') {
      return entries.filter((e) => e.index < activeIndex).reverse();
    }
    return entries.filter((e) => e.index > activeIndex);
  }, [entries, activeIndex]);

  const handleGo = useCallback((index: number): void => {
    void window.api.navHistory.go({ windowId: parentWindowId, index });
    window.close();
  }, []);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--vela-bg-surface, #1c1f26)',
    border: '1px solid var(--vela-border, rgba(255,255,255,0.09))',
    borderRadius: 8,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '4px',
    gap: 1,
    ...getGlassStyle(),
  };

  return (
    <div className="nav-history-list" style={containerStyle}>
      {visible.map((entry) => (
        <HistoryRow key={entry.index} entry={entry} onClick={() => handleGo(entry.index)} />
      ))}
      {visible.length === 0 && (
        <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--vela-fg-muted, #8c93a3)' }}>
          Sin historial.
        </div>
      )}
    </div>
  );
}

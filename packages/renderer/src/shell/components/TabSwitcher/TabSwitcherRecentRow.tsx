import { useTabSwitcherStore } from '../../../stores/tabSwitcherStore';
import type { RecentlyClosedTab } from '@vela/shared';
import { call } from '../../../lib/ipc';

interface TabSwitcherRecentRowProps {
  entry: RecentlyClosedTab;
  navIndex: number;
}

function faviconFallback(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    const code = hostname.charCodeAt(0);
    const colors = ['#7d8cff', '#6ad8a4', '#f5c76a', '#ff8a8a', '#c084fc', '#38bdf8'];
    return colors[code % colors.length] ?? '#7d8cff';
  } catch {
    return '#7d8cff';
  }
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function TabSwitcherRecentRow({ entry, navIndex }: TabSwitcherRecentRowProps) {
  const focusedIndex = useTabSwitcherStore((s) => s.focusedIndex);
  const setFocusedIndex = useTabSwitcherStore((s) => s.setFocusedIndex);
  const close = useTabSwitcherStore((s) => s.close);
  const isFocused = focusedIndex === navIndex;
  const hostname = getHostname(entry.url);

  const handleReopen = async (): Promise<void> => {
    await call(() => window.api.tab.reopenById({ closedTabId: entry.tabId }));
    close();
  };

  return (
    <div
      data-nav-index={navIndex}
      onMouseEnter={() => setFocusedIndex(navIndex)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 14px',
        background: isFocused ? 'var(--vela-sidebar-hover-bg)' : 'transparent',
        transition: 'background 80ms',
      }}
    >
      {/* Favicon */}
      {entry.favicon ? (
        <img
          src={entry.favicon}
          width={16}
          height={16}
          style={{ borderRadius: 2, flexShrink: 0, objectFit: 'cover' }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 3,
            background: faviconFallback(entry.url),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {entry.title.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Title */}
      <span
        style={{
          flex: 1,
          fontSize: 13,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: 'var(--vela-fg)',
        }}
      >
        {entry.title}
      </span>

      {/* Domain */}
      <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)', flexShrink: 0 }}>
        {hostname}
      </span>

      {/* Reopen button */}
      <button
        onClick={(e) => { e.stopPropagation(); void handleReopen(); }}
        style={{
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 4,
          background: 'var(--vela-bg-elevated)',
          border: '1px solid var(--vela-border)',
          color: 'var(--vela-fg-muted)',
          cursor: 'pointer',
          flexShrink: 0,
          fontFamily: 'var(--vela-font-family)',
        }}
      >
        Reabrir
      </button>
    </div>
  );
}

import { useTabSwitcherStore } from '../../../stores/tabSwitcherStore';
import { highlightMatch } from '../../../lib/fuzzy';
import type { TabNode, Workspace } from '@vela/shared';

interface TabSwitcherRowProps {
  tab: TabNode;
  workspace: Workspace;
  isActive: boolean;
  navIndex: number;
  showWorkspaceBadge?: boolean;
  isPlaying?: boolean;
  matchPositions?: number[];
  onActivate: () => void;
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

export function TabSwitcherRow({
  tab,
  workspace,
  isActive,
  navIndex,
  showWorkspaceBadge,
  isPlaying,
  matchPositions,
  onActivate,
}: TabSwitcherRowProps) {
  const focusedIndex = useTabSwitcherStore((s) => s.focusedIndex);
  const setFocusedIndex = useTabSwitcherStore((s) => s.setFocusedIndex);
  const isFocused = focusedIndex === navIndex;

  const title = tab.name ?? tab.originalTitle ?? tab.url;
  const hostname = getHostname(tab.url);
  const titleSegments = matchPositions && matchPositions.length > 0
    ? highlightMatch(title, matchPositions)
    : null;

  return (
    <div
      data-nav-index={navIndex}
      onClick={onActivate}
      onMouseEnter={() => setFocusedIndex(navIndex)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 14px',
        cursor: 'pointer',
        position: 'relative',
        background: isFocused ? 'var(--vela-sidebar-hover-bg)' : 'transparent',
        transition: 'background 80ms',
      }}
    >
      {/* Active dot */}
      <div
        style={{
          position: 'absolute',
          left: 4,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: isActive ? 'var(--vela-accent)' : 'transparent',
        }}
      />

      {/* Favicon */}
      {tab.favicon ? (
        <img
          src={tab.favicon}
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
            background: faviconFallback(tab.url),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 9,
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {(tab.name ?? tab.originalTitle ?? tab.url).charAt(0).toUpperCase()}
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
        {titleSegments
          ? titleSegments.map((seg, i) =>
              seg.highlighted ? (
                <mark key={i} style={{ background: 'transparent', color: 'var(--vela-accent)', fontWeight: 600 }}>
                  {seg.text}
                </mark>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )
          : title}
      </span>

      {/* Domain */}
      <span
        style={{
          fontSize: 11,
          color: 'var(--vela-fg-muted)',
          flexShrink: 0,
          maxWidth: 120,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {hostname}
      </span>

      {/* Badges */}
      {isPlaying && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--vela-fg-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}

      {showWorkspaceBadge && (
        <span
          style={{
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 10,
            background: workspace.color ? `${workspace.color}33` : 'var(--vela-bg-elevated)',
            color: workspace.color ?? 'var(--vela-fg-muted)',
            flexShrink: 0,
            maxWidth: 80,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            border: `1px solid ${workspace.color ? `${workspace.color}55` : 'var(--vela-border)'}`,
          }}
        >
          {workspace.name}
        </span>
      )}
    </div>
  );
}

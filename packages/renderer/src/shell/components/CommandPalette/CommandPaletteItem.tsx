import { highlightMatch } from '../../../lib/fuzzy';
import { getCategoryLabel } from './useCommandPalette';
import type { PaletteEntry } from './useCommandPalette';

interface CommandPaletteItemProps {
  entry: PaletteEntry;
  isFocused: boolean;
  navIndex: number;
  hasQuery: boolean;
  onActivate: () => void;
  onHover: () => void;
}

export function CommandPaletteItem({
  entry,
  isFocused,
  navIndex,
  hasQuery,
  onActivate,
  onHover,
}: CommandPaletteItemProps) {
  const hasArgs = (entry.paletteCmd.args?.length ?? 0) > 0;
  const titleSegments = hasQuery && entry._positions.length > 0
    ? highlightMatch(entry.title, entry._positions)
    : [{ text: entry.title, highlighted: false }];

  return (
    <div
      data-palette-index={navIndex}
      onClick={onActivate}
      onMouseEnter={onHover}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        cursor: 'pointer',
        background: isFocused ? 'var(--vela-sidebar-hover-bg)' : 'transparent',
        transition: 'background 80ms',
        userSelect: 'none',
      }}
    >
      {/* Title with highlight */}
      <span style={{ flex: 1, fontSize: 13, color: 'var(--vela-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {titleSegments.map((seg, i) =>
          seg.highlighted ? (
            <mark
              key={i}
              style={{
                background: 'transparent',
                color: 'var(--vela-accent)',
                fontWeight: 600,
              }}
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </span>

      {/* Category (hidden when there's an active query) */}
      {!hasQuery && (
        <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)', flexShrink: 0 }}>
          {getCategoryLabel(entry.category)}
        </span>
      )}

      {/* Shortcut badge */}
      {entry.shortcut && (
        <ShortcutBadge shortcut={entry.shortcut} />
      )}

      {/* Args indicator */}
      {hasArgs && (
        <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)', flexShrink: 0 }}>→</span>
      )}
    </div>
  );
}

function ShortcutBadge({ shortcut }: { shortcut: string }) {
  const parts = shortcut.split('+');
  return (
    <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
      {parts.map((part, i) => (
        <kbd
          key={i}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1px 5px',
            borderRadius: 4,
            background: 'var(--vela-bg)',
            border: '1px solid var(--vela-border)',
            fontSize: 10,
            color: 'var(--vela-fg-muted)',
            fontFamily: 'var(--vela-font-family)',
            minWidth: 18,
            lineHeight: '16px',
          }}
        >
          {part}
        </kbd>
      ))}
    </span>
  );
}

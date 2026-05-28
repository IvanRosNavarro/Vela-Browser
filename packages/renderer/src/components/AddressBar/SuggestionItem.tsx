import { Clock, Globe, Search, Terminal } from 'lucide-react';
import type { ExtendedSuggestion } from './useAddressBar';
import { Favicon } from '../Sidebar/Favicon';

interface SuggestionItemProps {
  suggestion: ExtendedSuggestion;
  active: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}

export function SuggestionItem({
  suggestion,
  active,
  onSelect,
  onMouseEnter,
}: SuggestionItemProps) {
  const baseStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 10px',
    cursor: 'pointer',
    background: active ? 'var(--vela-suggestion-bg-active)' : 'transparent',
    color: 'var(--vela-fg)',
    fontSize: 12,
    minHeight: 30,
  } as const;

  // El click se maneja en mousedown (no click) para no perder foco antes de
  // que la acción se dispare: el blur del input cancelaría el submit.
  const onMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault();
    onSelect();
  };

  if (suggestion.type === 'command') {
    return (
      <div
        role="option"
        aria-selected={active}
        style={baseStyle}
        onMouseEnter={onMouseEnter}
        onMouseDown={onMouseDown}
      >
        <Terminal
          size={16}
          color="var(--vela-addressbar-fg-muted)"
          style={{ flex: '0 0 auto' }}
        />
        <span className="truncate flex-1">{suggestion.title}</span>
        {suggestion.shortcut && (
          <kbd
            style={{
              fontSize: 10,
              padding: '1px 5px',
              borderRadius: 3,
              background: 'var(--vela-bg-sidebar-elev)',
              border: '1px solid var(--vela-border)',
              color: 'var(--vela-fg-muted)',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            {suggestion.shortcut}
          </kbd>
        )}
      </div>
    );
  }

  if (suggestion.type === 'open-tab') {
    return (
      <div
        role="option"
        aria-selected={active}
        style={baseStyle}
        onMouseEnter={onMouseEnter}
        onMouseDown={onMouseDown}
      >
        <Favicon
          src={suggestion.favicon}
          alt=""
          size={16}
          fallbackChar={(suggestion.title || suggestion.url || '?').charAt(0)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span
            className="truncate"
            style={{ color: 'var(--vela-addressbar-fg)' }}
          >
            {suggestion.title || suggestion.url}
          </span>
          <span
            className="truncate"
            style={{ color: 'var(--vela-addressbar-fg-muted)', fontSize: 11 }}
          >
            {suggestion.url}
          </span>
        </div>
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
          style={{
            background: 'var(--vela-bg-sidebar-elev)',
            color: 'var(--vela-fg-muted)',
            border: '1px solid var(--vela-border)',
          }}
        >
          {suggestion.workspaceName}
        </span>
      </div>
    );
  }

  if (suggestion.type === 'history') {
    const diffDays = Math.floor((Date.now() - suggestion.visitedAt) / 86_400_000);
    const timeLabel =
      diffDays === 0 ? 'hoy' :
      diffDays === 1 ? 'ayer' :
      `hace ${diffDays} días`;

    return (
      <div
        role="option"
        aria-selected={active}
        style={baseStyle}
        onMouseEnter={onMouseEnter}
        onMouseDown={onMouseDown}
      >
        {suggestion.favicon ? (
          <img
            src={suggestion.favicon}
            alt=""
            style={{ width: 16, height: 16, flexShrink: 0, objectFit: 'contain' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <Clock
            size={14}
            color="var(--vela-addressbar-fg-muted)"
            style={{ flex: '0 0 auto' }}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate" style={{ color: 'var(--vela-addressbar-fg)' }}>
            {suggestion.title || suggestion.url}
          </span>
          <span className="truncate" style={{ color: 'var(--vela-addressbar-fg-muted)', fontSize: 11 }}>
            {suggestion.url}
          </span>
        </div>
        <span
          className="shrink-0 text-[10px]"
          style={{ color: 'var(--vela-addressbar-fg-muted)' }}
        >
          {timeLabel}
        </span>
      </div>
    );
  }

  if (suggestion.type === 'navigate') {
    return (
      <div
        role="option"
        aria-selected={active}
        style={baseStyle}
        onMouseEnter={onMouseEnter}
        onMouseDown={onMouseDown}
      >
        <Globe
          size={16}
          color="var(--vela-addressbar-fg-muted)"
          style={{ flex: '0 0 auto' }}
        />
        <span className="truncate flex-1">{suggestion.url}</span>
        <span
          className="shrink-0 text-[10px] uppercase tracking-wide"
          style={{ color: 'var(--vela-addressbar-fg-muted)' }}
        >
          Ir a
        </span>
      </div>
    );
  }

  return (
    <div
      role="option"
      aria-selected={active}
      style={baseStyle}
      onMouseEnter={onMouseEnter}
      onMouseDown={onMouseDown}
    >
      <Search
        size={16}
        color="var(--vela-addressbar-fg-muted)"
        style={{ flex: '0 0 auto' }}
      />
      <span className="truncate flex-1">{suggestion.query}</span>
      <span
        className="shrink-0 text-[10px] uppercase tracking-wide"
        style={{ color: 'var(--vela-addressbar-fg-muted)' }}
      >
        {suggestion.engine}
      </span>
    </div>
  );
}

import { useEffect, useLayoutEffect, useState } from 'react';
import { IPC_EVENTS, type ExtendedSuggestion } from '@vela/shared';
import { getGlassStyle } from '../../lib/popupGlass';

function getDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function relativeTime(ts: number): string {
  const diffDays = Math.floor((Date.now() - ts) / 86_400_000);
  if (diffDays === 0) return 'hoy';
  if (diffDays === 1) return 'hace 1 día';
  if (diffDays < 30) return `hace ${diffDays} días`;
  const months = Math.floor(diffDays / 30);
  if (months === 1) return 'hace 1 mes';
  if (months < 12) return `hace ${months} meses`;
  return `hace ${Math.floor(months / 12)} años`;
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function CommandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

function SectionHeader({ label, showBorder }: { label: string; showBorder: boolean }) {
  return (
    <div style={{
      padding: '6px 16px 4px',
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.06em',
      color: 'var(--vela-fg-muted)',
      borderTop: showBorder ? '1px solid var(--vela-border)' : 'none',
    }}>
      {label}
    </div>
  );
}

function ResultRow({
  suggestion,
  active,
  onSelect,
}: {
  suggestion: ExtendedSuggestion;
  active: boolean;
  onSelect: () => void;
}) {
  const title = (() => {
    if (suggestion.type === 'command') return suggestion.title;
    if (suggestion.type === 'search') return `Buscar "${suggestion.query}" en ${suggestion.engine}`;
    if (suggestion.type === 'navigate') return suggestion.url;
    if (suggestion.type === 'history') return suggestion.title || suggestion.url;
    if (suggestion.type === 'open-tab') return suggestion.title || suggestion.url;
    return '';
  })();

  const sub = (() => {
    if (suggestion.type === 'history') return getDomain(suggestion.url);
    if (suggestion.type === 'open-tab') return getDomain(suggestion.url);
    if (suggestion.type === 'command') return suggestion.shortcut ?? '';
    return null;
  })();

  const favicon =
    suggestion.type === 'open-tab' ? suggestion.favicon :
    suggestion.type === 'history' ? suggestion.favicon : null;

  const icon = (() => {
    if (favicon) return null;
    if (suggestion.type === 'search') return <SearchIcon />;
    if (suggestion.type === 'navigate') return <GlobeIcon />;
    if (suggestion.type === 'command') return <CommandIcon />;
    return <GlobeIcon />;
  })();

  const rightMeta = (() => {
    if (suggestion.type === 'open-tab') {
      return (
        <span style={{
          fontSize: 10,
          color: active ? 'rgba(255,255,255,0.8)' : 'var(--vela-accent)',
          background: active ? 'rgba(255,255,255,0.2)' : 'color-mix(in srgb, var(--vela-accent) 15%, transparent)',
          borderRadius: 3,
          padding: '1px 5px',
          flexShrink: 0,
          whiteSpace: 'nowrap' as const,
        }}>
          {suggestion.workspaceName}
        </span>
      );
    }
    if (suggestion.type === 'history') {
      return (
        <span style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.7)' : 'var(--vela-fg-muted)', flexShrink: 0 }}>
          {relativeTime(suggestion.visitedAt)}
        </span>
      );
    }
    if (suggestion.type === 'navigate') {
      return (
        <span style={{ fontSize: 10, color: active ? 'rgba(255,255,255,0.7)' : 'var(--vela-fg-muted)', flexShrink: 0 }}>
          Ir a
        </span>
      );
    }
    if (suggestion.type === 'command' && suggestion.shortcut) {
      return (
        <kbd style={{
          fontSize: 10,
          padding: '1px 5px',
          borderRadius: 3,
          background: active ? 'rgba(255,255,255,0.15)' : 'var(--vela-bg-elevated, #22252e)',
          border: `1px solid ${active ? 'rgba(255,255,255,0.3)' : 'var(--vela-border)'}`,
          color: active ? 'rgba(255,255,255,0.8)' : 'var(--vela-fg-muted)',
          fontFamily: 'inherit',
          flexShrink: 0,
        }}>
          {suggestion.shortcut}
        </kbd>
      );
    }
    return null;
  })();

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '6px 16px',
        minHeight: 38,
        background: active ? 'var(--vela-accent)' : 'transparent',
        cursor: 'pointer',
        userSelect: 'none' as const,
        transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--vela-bg-surface-hover, var(--vela-hover))';
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      <span style={{ color: active ? 'rgba(255,255,255,0.7)' : 'var(--vela-fg-muted)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {favicon ? (
          <img src={favicon} width={14} height={14} style={{ objectFit: 'contain' }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} alt="" />
        ) : icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          fontWeight: suggestion.type === 'open-tab' ? 500 : 400,
          color: active ? 'white' : 'var(--vela-fg)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const,
        }}>
          {title}
        </div>
        {sub && (
          <div style={{
            fontSize: 10,
            color: active ? 'rgba(255,255,255,0.7)' : 'var(--vela-fg-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap' as const,
          }}>
            {sub}
          </div>
        )}
      </div>
      {rightMeta}
    </div>
  );
}

export function App() {
  const [suggestions, setSuggestions] = useState<ExtendedSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Fetch initial data via IPC (avoids URL length limits from long history URLs).
  // useLayoutEffect runs before did-finish-load, so main already has the data ready.
  useLayoutEffect(() => {
    void window.api.suggestionsPopup.getInitialData().then((data) => {
      if (data) {
        setSuggestions(data.suggestions);
        setSelectedIndex(data.selectedIndex);
      }
    });
  }, []);

  useEffect(() => {
    const unsub = window.api.on(IPC_EVENTS.SUGGESTIONS_POPUP_DATA, (payload) => {
      setSuggestions(payload.suggestions);
      setSelectedIndex(payload.selectedIndex);
    });
    return unsub;
  }, []);

  const handleSelect = (suggestion: ExtendedSuggestion) => {
    void window.api.suggestionsPopup.select({ suggestion, newTab: false });
  };

  if (suggestions.length === 0) return null;

  const containerStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--vela-bg-surface)',
    border: '1px solid var(--vela-border)',
    borderRadius: 10,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
    ...getGlassStyle(),
  };

  // Command mode → flat list (no sections)
  const hasCommands = suggestions.some((s) => s.type === 'command');
  if (hasCommands) {
    return (
      <div style={containerStyle}>
        {suggestions.map((s, idx) => (
          <ResultRow
            key={s.type === 'command' ? `cmd:${s.id}` : `${s.type}:${idx}`}
            suggestion={s}
            active={idx === selectedIndex}
            onSelect={() => handleSelect(s)}
          />
        ))}
      </div>
    );
  }

  // Sectioned mode: navigate/search (no header) → tabs → history
  const navigate = suggestions.filter((s) => s.type === 'navigate' || s.type === 'search');
  const tabs = suggestions.filter((s) => s.type === 'open-tab');
  const history = suggestions.filter((s) => s.type === 'history');

  let globalIdx = 0;

  return (
    <div style={containerStyle}>
      {navigate.map((s, i) => {
        const idx = globalIdx++;
        return (
          <ResultRow
            key={`web:${i}`}
            suggestion={s}
            active={idx === selectedIndex}
            onSelect={() => handleSelect(s)}
          />
        );
      })}
      {tabs.length > 0 && (
        <>
          <SectionHeader label="Pestañas abiertas" showBorder={navigate.length > 0} />
          {tabs.map((s) => {
            const idx = globalIdx++;
            return (
              <ResultRow
                key={`tab:${(s as { tabId?: string }).tabId ?? idx}`}
                suggestion={s}
                active={idx === selectedIndex}
                onSelect={() => handleSelect(s)}
              />
            );
          })}
        </>
      )}
      {history.length > 0 && (
        <>
          <SectionHeader label="En el historial" showBorder={(navigate.length + tabs.length) > 0} />
          {history.map((s) => {
            const idx = globalIdx++;
            return (
              <ResultRow
                key={`hist:${(s as { id?: string }).id ?? idx}`}
                suggestion={s}
                active={idx === selectedIndex}
                onSelect={() => handleSelect(s)}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

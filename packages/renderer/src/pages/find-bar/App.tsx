import { useEffect, useRef, useState, useCallback, type CSSProperties, type ReactNode, type ChangeEvent, type KeyboardEvent } from 'react';
import { IPC_EVENTS } from '@vela/shared';

const params = new URLSearchParams(window.location.search);
const parentWindowId = parseInt(params.get('windowId') ?? '0', 10);

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconChevronUp() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function Btn({
  onClick,
  title,
  active = false,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        borderRadius: 4,
        border: 'none',
        cursor: 'pointer',
        flexShrink: 0,
        padding: 0,
        background: active
          ? 'var(--vela-accent, #5b8ef4)'
          : hovered
            ? 'var(--vela-hover, rgba(255,255,255,0.08))'
            : 'transparent',
        color: active ? 'var(--vela-accent-fg, #fff)' : 'var(--vela-fg, #e6e8ee)',
        opacity: active || hovered ? 1 : 0.65,
        transition: 'background 100ms, opacity 100ms',
      } as CSSProperties}
    >
      {children}
    </button>
  );
}

export function App() {
  const [query, setQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  useEffect(() => {
    const off = window.api.on(IPC_EVENTS.FIND_RESULT, (payload) => {
      if (payload.windowId !== parentWindowId) return;
      setCurrent(payload.current);
      setTotal(payload.total);
    });
    return off;
  }, []);

  const doSearch = useCallback((text: string, mc: boolean) => {
    if (text) {
      void window.api.find.start({ text, matchCase: mc, windowId: parentWindowId });
    } else {
      setCurrent(0);
      setTotal(0);
      void window.api.find.stop({ windowId: parentWindowId });
    }
  }, []);

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    doSearch(v, matchCase);
  }, [matchCase, doSearch]);

  const handleToggleCase = useCallback(() => {
    const next = !matchCase;
    setMatchCase(next);
    if (query) doSearch(query, next);
  }, [matchCase, query, doSearch]);

  const handleNext = useCallback(() => {
    void window.api.find.next({ windowId: parentWindowId });
  }, []);

  const handlePrev = useCallback(() => {
    void window.api.find.prev({ windowId: parentWindowId });
  }, []);

  const handleClose = useCallback(() => {
    void window.api.findBar.close({ windowId: parentWindowId });
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) handlePrev();
      else handleNext();
    }
  }, [handleClose, handleNext, handlePrev]);

  const noMatches = query.length > 0 && total === 0;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '0 8px',
        background: 'var(--vela-bg-elevated, #22252e)',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.2)',
        border: '1px solid var(--vela-border, rgba(255,255,255,0.09))',
        userSelect: 'none',
        overflow: 'hidden',
      } as CSSProperties}
    >
      {/* Search icon */}
      <span
        style={{
          color: noMatches ? 'var(--vela-warning, #f0a500)' : 'var(--vela-fg-muted, #8c93a3)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <IconSearch />
      </span>

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleQueryChange}
        onKeyDown={handleKeyDown}
        placeholder="Buscar en página…"
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: noMatches ? 'var(--vela-warning, #f0a500)' : 'var(--vela-fg, #e6e8ee)',
          fontSize: 13,
          minWidth: 0,
          caretColor: 'var(--vela-accent, #5b8ef4)',
        } as CSSProperties}
        spellCheck={false}
        autoComplete="off"
      />

      {/* Counter */}
      {query.length > 0 && (
        <span
          style={{
            fontSize: 11,
            color: noMatches ? 'var(--vela-warning, #f0a500)' : 'var(--vela-fg-muted, #8c93a3)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            minWidth: 40,
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
          aria-live="polite"
          aria-atomic
        >
          {noMatches ? '0 / 0' : `${current} / ${total}`}
        </span>
      )}

      {/* Divider */}
      <div aria-hidden style={{ width: 1, height: 16, background: 'var(--vela-border, rgba(255,255,255,0.09))', flexShrink: 0 }} />

      {/* Prev */}
      <Btn title="Anterior (Shift+Enter)" onClick={handlePrev}>
        <IconChevronUp />
      </Btn>

      {/* Next */}
      <Btn title="Siguiente (Enter)" onClick={handleNext}>
        <IconChevronDown />
      </Btn>

      {/* Divider */}
      <div aria-hidden style={{ width: 1, height: 16, background: 'var(--vela-border, rgba(255,255,255,0.09))', flexShrink: 0 }} />

      {/* Match case */}
      <Btn title="Distinguir mayúsculas (Alt+C)" onClick={handleToggleCase} active={matchCase}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1 }}>Aa</span>
      </Btn>

      {/* Close */}
      <Btn title="Cerrar (Escape)" onClick={handleClose}>
        <IconX />
      </Btn>
    </div>
  );
}

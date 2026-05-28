import { useEffect } from 'react';
import { useTabSwitcherStore } from '../../../stores/tabSwitcherStore';

interface TabSwitcherSearchProps {
  inputRef: React.RefObject<HTMLInputElement>;
}

export function TabSwitcherSearch({ inputRef }: TabSwitcherSearchProps) {
  const query = useTabSwitcherStore((s) => s.query);
  const setQuery = useTabSwitcherStore((s) => s.setQuery);
  const isOpen = useTabSwitcherStore((s) => s.isOpen);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen, inputRef]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        borderBottom: '1px solid var(--vela-border)',
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--vela-fg-muted)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar pestañas..."
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'var(--vela-fg)',
          fontSize: 14,
          fontFamily: 'var(--vela-font-family)',
        }}
      />
      {query && (
        <button
          onClick={() => setQuery('')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--vela-fg-muted)',
            fontSize: 18,
            lineHeight: 1,
            padding: '0 2px',
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

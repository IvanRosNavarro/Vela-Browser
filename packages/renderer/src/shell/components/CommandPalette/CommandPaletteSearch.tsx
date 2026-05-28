interface CommandPaletteSearchProps {
  inputRef: React.RefObject<HTMLInputElement>;
  query: string;
  onQueryChange: (q: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  placeholder?: string;
}

export function CommandPaletteSearch({
  inputRef,
  query,
  onQueryChange,
  onKeyDown,
  placeholder = 'Escribe un comando…',
}: CommandPaletteSearchProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderBottom: '1px solid var(--vela-border)',
        flexShrink: 0,
      }}
    >
      {/* Lightning bolt icon */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--vela-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>

      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        style={{
          flex: 1,
          background: 'none',
          border: 'none',
          outline: 'none',
          fontSize: 14,
          color: 'var(--vela-fg)',
          fontFamily: 'var(--vela-font-family)',
        }}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}

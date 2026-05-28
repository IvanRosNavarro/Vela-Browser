interface CookieSearchProps {
  value: string;
  onChange: (v: string) => void;
}

export function CookieSearch({ value, onChange }: CookieSearchProps) {
  return (
    <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--vela-border)', flexShrink: 0 }}>
      <input
        type="text"
        placeholder="Filtrar cookies…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--vela-bg-surface)',
          border: '1px solid var(--vela-border)',
          borderRadius: 6, padding: '4px 8px',
          fontSize: 12, color: 'var(--vela-fg)',
          outline: 'none',
        }}
      />
    </div>
  );
}

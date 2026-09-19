import type { ReactNode } from 'react';

// Piezas comunes de las vistas de Direcciones y Tarjetas del gestor.

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)', width: 110, flexShrink: 0, textAlign: 'right' }}>
        {label}
      </span>
      <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>{children}</span>
    </label>
  );
}

export function ListRow({
  title,
  subtitle,
  badge,
  selected,
  onSelect,
  onDelete,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        cursor: 'pointer',
        background: selected ? 'rgba(91,142,244,0.12)' : 'transparent',
        borderBottom: '1px solid var(--vela-border)',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = 'var(--vela-hover)';
        const btn = e.currentTarget.querySelector<HTMLButtonElement>('.del-btn');
        if (btn) btn.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent';
        const btn = e.currentTarget.querySelector<HTMLButtonElement>('.del-btn');
        if (btn) btn.style.opacity = '0';
      }}
    >
      {badge && (
        <span style={{
          flexShrink: 0,
          minWidth: 36,
          fontSize: 9,
          fontWeight: 700,
          textAlign: 'center',
          padding: '3px 4px',
          borderRadius: 4,
          border: '1px solid var(--vela-border)',
          color: 'var(--vela-fg-muted)',
        }}>
          {badge}
        </span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--vela-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--vela-fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subtitle}
        </div>
      </div>
      <button
        className="del-btn"
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        style={{
          opacity: 0,
          transition: 'opacity 100ms',
          background: 'none',
          border: 'none',
          color: 'var(--vela-danger)',
          fontSize: 14,
          cursor: 'pointer',
          padding: '0 2px',
          flexShrink: 0,
        }}
        title="Eliminar"
      >
        ×
      </button>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <p style={{ color: 'var(--vela-fg-muted)', fontSize: 12 }}>{text}</p>
    </div>
  );
}

export const inputStyle: React.CSSProperties = {
  background: 'var(--vela-bg-elevated)',
  border: '1px solid var(--vela-border)',
  borderRadius: 5,
  color: 'var(--vela-fg)',
  fontSize: 12,
  padding: '4px 8px',
  outline: 'none',
  flex: 1,
  minWidth: 0,
};

export const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  borderBottom: '1px solid var(--vela-border)',
  background: 'var(--vela-bg-surface)',
};

export const btnPriStyle: React.CSSProperties = {
  background: 'var(--vela-accent)',
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  fontSize: 11,
  padding: '5px 12px',
  cursor: 'pointer',
  fontWeight: 500,
};

export const btnSecStyle: React.CSSProperties = {
  background: 'var(--vela-bg-elevated)',
  border: '1px solid var(--vela-border)',
  borderRadius: 6,
  color: 'var(--vela-fg)',
  fontSize: 11,
  padding: '5px 12px',
  cursor: 'pointer',
};

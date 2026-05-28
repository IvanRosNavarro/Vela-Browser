import type { VaultEntrySummary } from '@vela/shared';

interface Props {
  entries: VaultEntrySummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function PasswordsList({ entries, selectedId, onSelect, onDelete }: Props) {
  return (
    <div style={{ width: 260, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--vela-border)' }}>
      {entries.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <p style={{ color: 'var(--vela-fg-muted)', fontSize: 12 }}>Sin contraseñas guardadas</p>
        </div>
      ) : (
        entries.map((entry) => (
          <PasswordRow
            key={entry.id}
            entry={entry}
            selected={entry.id === selectedId}
            onSelect={() => onSelect(entry.id)}
            onDelete={() => onDelete(entry.id)}
          />
        ))
      )}
    </div>
  );
}

interface RowProps {
  entry: VaultEntrySummary;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function PasswordRow({ entry, selected, onSelect, onDelete }: RowProps) {
  const favicon = `https://www.google.com/s2/favicons?domain=${entry.domain}&sz=32`;
  const date = new Date(entry.updatedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });

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
        position: 'relative',
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLDivElement).style.background = 'var(--vela-hover)';
        const btn = e.currentTarget.querySelector('.del-btn') as HTMLButtonElement | null;
        if (btn) btn.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        const btn = e.currentTarget.querySelector('.del-btn') as HTMLButtonElement | null;
        if (btn) btn.style.opacity = '0';
      }}
    >
      <img
        src={favicon}
        width={20}
        height={20}
        style={{ borderRadius: 4, flexShrink: 0 }}
        onError={(e) => {
          const el = e.target as HTMLImageElement;
          el.style.display = 'none';
        }}
        alt=""
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--vela-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.domain}
        </div>
        <div style={{ fontSize: 11, color: 'var(--vela-fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.username}
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--vela-fg-muted)', flexShrink: 0 }}>{date}</div>
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

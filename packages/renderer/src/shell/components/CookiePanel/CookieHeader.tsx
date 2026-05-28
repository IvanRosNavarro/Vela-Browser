interface CookieHeaderProps {
  hostname: string;
  count: number;
  confirmDeleteAll: boolean;
  onDeleteAll: () => void;
  onCancelDelete: () => void;
  onClose: () => void;
}

export function CookieHeader({ hostname, count, confirmDeleteAll, onDeleteAll, onCancelDelete, onClose }: CookieHeaderProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 12px',
      borderBottom: '1px solid var(--vela-border)',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 15 }}>🍪</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600, fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hostname}
        </span>
      </div>
      <span style={{
        fontSize: 11, fontWeight: 600,
        background: 'var(--vela-bg-surface)',
        border: '1px solid var(--vela-border)',
        borderRadius: 10, padding: '1px 7px',
        color: 'var(--vela-fg-muted)',
        flexShrink: 0,
      }}>
        {count}
      </span>

      {confirmDeleteAll ? (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)', alignSelf: 'center' }}>
            ¿Eliminar {count}?
          </span>
          <button
            onClick={onDeleteAll}
            style={{ fontSize: 11, borderRadius: 4, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer', padding: '2px 8px' }}
          >
            Eliminar
          </button>
          <button
            onClick={onCancelDelete}
            style={{ fontSize: 11, borderRadius: 4, border: '1px solid var(--vela-border)', background: 'transparent', color: 'var(--vela-fg-muted)', cursor: 'pointer', padding: '2px 8px' }}
          >
            Cancelar
          </button>
        </div>
      ) : count > 0 ? (
        <button
          title="Eliminar todas las cookies"
          onClick={onDeleteAll}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--vela-fg-muted)', display: 'flex', flexShrink: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      ) : null}

      <button
        title="Cerrar"
        onClick={onClose}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--vela-fg-muted)', display: 'flex', flexShrink: 0 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}

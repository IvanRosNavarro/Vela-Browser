interface Props {
  folders: string[];
  activeFolder: string | null;
  onSelectFolder: (folder: string | null) => void;
  tab: 'passwords' | 'audit';
  onTabChange: (tab: 'passwords' | 'audit') => void;
}

export function FolderSidebar({ folders, activeFolder, onSelectFolder, tab, onTabChange }: Props) {
  return (
    <aside style={{
      width: 180,
      flexShrink: 0,
      background: 'var(--vela-bg-surface)',
      borderRight: '1px solid var(--vela-border)',
      display: 'flex',
      flexDirection: 'column',
      paddingTop: 8,
    }}>
      <div style={{ padding: '0 8px 8px', borderBottom: '1px solid var(--vela-border)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--vela-fg-muted)', padding: '4px 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Vistas
        </div>
        {(['passwords', 'audit'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTabChange(t)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              width: '100%',
              padding: '6px 10px',
              borderRadius: 6,
              border: 'none',
              background: tab === t ? 'rgba(91,142,244,0.15)' : 'transparent',
              color: tab === t ? 'var(--vela-accent)' : 'var(--vela-fg)',
              fontSize: 12,
              textAlign: 'left',
              cursor: 'pointer',
              marginBottom: 2,
            }}
          >
            {t === 'passwords' ? '🔑 Contraseñas' : '🛡 Auditoría'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--vela-fg-muted)', padding: '4px 8px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Carpetas
        </div>
        <button
          type="button"
          onClick={() => onSelectFolder(null)}
          style={folderBtnStyle(activeFolder === null)}
        >
          📁 Todas
        </button>
        {folders.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onSelectFolder(f)}
            style={folderBtnStyle(activeFolder === f)}
          >
            📁 {f}
          </button>
        ))}
      </div>
    </aside>
  );
}

function folderBtnStyle(active: boolean): React.CSSProperties {
  return {
    display: 'block',
    width: '100%',
    padding: '5px 10px',
    borderRadius: 6,
    border: 'none',
    background: active ? 'rgba(91,142,244,0.15)' : 'transparent',
    color: active ? 'var(--vela-accent)' : 'var(--vela-fg)',
    fontSize: 12,
    textAlign: 'left',
    cursor: 'pointer',
    marginBottom: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
}

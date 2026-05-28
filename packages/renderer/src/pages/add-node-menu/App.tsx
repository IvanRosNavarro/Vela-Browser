import { getGlassStyle } from '../../lib/popupGlass';

const params = new URLSearchParams(window.location.search);
const parentWindowId = parseInt(params.get('windowId') ?? '0', 10);
const workspaceId = params.get('workspaceId') ?? '';
const parentId = params.get('parentId') ?? null;

type Action = 'new-tab' | 'new-folder' | 'new-secure-tab';

async function triggerAction(action: Action): Promise<void> {
  await window.api.addNodeMenu.action({ windowId: parentWindowId, action, workspaceId, parentId });
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--vela-bg-surface, #1c1f26)',
  border: '1px solid var(--vela-border, rgba(255,255,255,0.09))',
  borderRadius: 8,
  overflow: 'hidden',
  padding: '4px 0',
  ...getGlassStyle(),
};

const btnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '6px 12px',
  background: 'none',
  border: 'none',
  textAlign: 'left',
  fontSize: 13,
  cursor: 'pointer',
  color: 'var(--vela-fg, #e6e8ee)',
};

function MenuItem({ label, icon, accent, onClick }: {
  label: string;
  icon: string;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      style={{ ...btnStyle, color: accent ? 'var(--vela-accent, #5b8ef4)' : btnStyle.color }}
      onClick={onClick}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.06))'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
    >
      <span className={`ti ${icon}`} style={{ fontSize: 14, flexShrink: 0 }} aria-hidden />
      {label}
    </button>
  );
}

export function App() {
  return (
    <div style={containerStyle}>
      <MenuItem
        label="Nueva pestaña"
        icon="ti-plus"
        onClick={() => void triggerAction('new-tab')}
      />
      <MenuItem
        label="Nueva carpeta"
        icon="ti-folder-plus"
        onClick={() => void triggerAction('new-folder')}
      />
      <div style={{ height: 1, background: 'var(--vela-border, rgba(255,255,255,0.09))', margin: '4px 0' }} />
      <MenuItem
        label="Nueva pestaña blindada"
        icon="ti-shield-lock"
        accent
        onClick={() => void triggerAction('new-secure-tab')}
      />
    </div>
  );
}

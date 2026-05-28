export type ViewMode = 'grid' | 'list';

interface FavoritesToolbarProps {
  query: string;
  onQueryChange: (q: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onNewFolder: () => void;
  onOpenAll: () => void;
  onExport: () => void;
  onImport: () => void;
}

const btn: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid var(--vela-border)',
  background: 'var(--vela-bg-row-hover)',
  color: 'var(--vela-fg)',
  fontSize: 12,
  cursor: 'default',
  whiteSpace: 'nowrap',
  display: 'flex',
  alignItems: 'center',
  gap: 5,
};

const iconBtn = (active?: boolean): React.CSSProperties => ({
  ...btn,
  padding: '5px 8px',
  background: active ? 'var(--vela-accent)' : 'var(--vela-bg-row-hover)',
  color: active ? '#fff' : 'var(--vela-fg)',
  border: active ? '1px solid var(--vela-accent)' : '1px solid var(--vela-border)',
});

function IcoGrid() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function IcoList() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function IcoFolder() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function FavoritesToolbar({
  query, onQueryChange, viewMode, onViewModeChange, onNewFolder, onOpenAll, onExport, onImport,
}: FavoritesToolbarProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderBottom: '1px solid var(--vela-border)', background: 'var(--vela-bg-app)', flexShrink: 0 }}>
      <input
        type="search"
        placeholder="Buscar favoritos…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        style={{ flex: 1, background: 'var(--vela-suggestion-bg)', border: '1px solid var(--vela-addressbar-border)', borderRadius: 8, padding: '5px 10px', fontSize: 13, color: 'var(--vela-fg)', outline: 'none' }}
      />

      {/* View toggle */}
      <button type="button" onClick={() => onViewModeChange('grid')} title="Vista cuadrícula" style={iconBtn(viewMode === 'grid')}>
        <IcoGrid />
      </button>
      <button type="button" onClick={() => onViewModeChange('list')} title="Vista lista" style={iconBtn(viewMode === 'list')}>
        <IcoList />
      </button>

      <div style={{ width: 1, height: 20, background: 'var(--vela-border)', flexShrink: 0 }} />

      <button type="button" onClick={onNewFolder} title="Nueva carpeta" style={btn}>
        <IcoFolder /> Nueva carpeta
      </button>
      <button type="button" onClick={onOpenAll} style={btn}>Abrir todos</button>
      <button type="button" onClick={onExport} style={btn}>Exportar</button>
      <button type="button" onClick={onImport} style={btn}>Importar</button>
    </div>
  );
}

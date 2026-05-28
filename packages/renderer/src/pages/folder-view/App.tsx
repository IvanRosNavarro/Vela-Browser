import { useCallback, useEffect, useState } from 'react';
import { IPC_EVENTS, isFolderLike } from '@vela/shared';
import type { TabNode, TreeNode } from '@vela/shared';
import { themeManager } from '../../shared-ui/theme';

// ─── helpers ──────────────────────────────────────────────────────────────────

function deriveTabTitle(node: TabNode): string {
  if (node.name?.trim()) return node.name;
  if (node.originalTitle?.trim()) return node.originalTitle;
  try { return new URL(node.url).hostname; } catch { return node.url; }
}

function FaviconImg({ src, fallback, size }: { src: string | null; fallback: string; size: number }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 4, flexShrink: 0,
        background: 'var(--vela-bg-folder-hover)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.floor(size * 0.6), fontWeight: 600,
        color: 'var(--vela-fg-muted)', textTransform: 'uppercase',
      }}>
        {fallback.charAt(0)}
      </div>
    );
  }
  return (
    <img src={src} alt="" width={size} height={size}
      style={{ borderRadius: 4, flexShrink: 0, objectFit: 'contain' }}
      onError={() => setErr(true)} draggable={false}
    />
  );
}

// ─── list item ────────────────────────────────────────────────────────────────

function ListItem({ node, onClick }: { node: TreeNode; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const isFolder = isFolderLike(node);
  const tab = !isFolder && node.kind === 'tab' ? (node as TabNode) : null;
  const name = tab ? deriveTabTitle(tab) : (node.name ?? 'Carpeta');
  const markerColor = node.color ?? 'var(--vela-folder-marker-default)';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 20px', cursor: 'default',
        background: hovered ? 'var(--vela-bg-row-hover)' : 'transparent',
        borderBottom: '1px solid var(--vela-border)',
        transition: 'background 80ms',
      }}
    >
      {tab ? (
        <FaviconImg src={tab.favicon} fallback={name} size={20} />
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', width: 20, height: 20, flexShrink: 0 }}>
          {node.icon ? (
            <span style={{ fontSize: 16, lineHeight: 1 }}>{node.icon}</span>
          ) : (
            <span style={{ width: 3, height: 14, borderRadius: 2, background: markerColor, display: 'block' }} />
          )}
        </span>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 500, color: 'var(--vela-fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}
        </div>
        {tab && (
          <div style={{
            fontSize: 11, color: 'var(--vela-fg-muted)', marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {tab.url}
          </div>
        )}
        {isFolder && (
          <div style={{ fontSize: 11, color: 'var(--vela-fg-muted)', marginTop: 1 }}>
            Carpeta
          </div>
        )}
      </div>

      {isFolder && (
        <span style={{ fontSize: 14, color: 'var(--vela-fg-muted)', flexShrink: 0 }}>›</span>
      )}
    </div>
  );
}

// ─── grid item ────────────────────────────────────────────────────────────────

function GridItem({ node, onClick }: { node: TreeNode; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const isFolder = isFolderLike(node);
  const tab = !isFolder && node.kind === 'tab' ? (node as TabNode) : null;
  const name = tab ? deriveTabTitle(tab) : (node.name ?? 'Carpeta');
  const markerColor = node.color ?? null;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', width: 152, borderRadius: 10,
        border: `1px solid ${hovered ? (markerColor ?? 'var(--vela-fg-muted)') : 'var(--vela-border)'}`,
        background: hovered ? 'var(--vela-bg-row-hover)' : 'var(--vela-bg-surface)',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.18)' : '0 1px 4px rgba(0,0,0,0.08)',
        transform: hovered ? 'translateY(-1px)' : 'none',
        transition: 'background 120ms, border-color 120ms, box-shadow 120ms, transform 120ms',
        userSelect: 'none', overflow: 'hidden', cursor: 'default',
      }}
    >
      <div style={{
        height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderBottom: '1px solid var(--vela-border)',
        background: markerColor
          ? `color-mix(in srgb, ${markerColor} 12%, var(--vela-bg-app))`
          : 'var(--vela-bg-app)',
      }}>
        {tab ? (
          <FaviconImg src={tab.favicon} fallback={name} size={36} />
        ) : (
          <span style={{ fontSize: 34, lineHeight: 1, userSelect: 'none', filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.2))' }}>
            {node.icon ?? '📁'}
          </span>
        )}
      </div>
      <div style={{ padding: '9px 10px 8px' }}>
        <div style={{
          fontSize: 12, fontWeight: 500, color: 'var(--vela-fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {name}
        </div>
        {tab && (
          <div style={{
            fontSize: 10, color: 'var(--vela-fg-muted)', marginTop: 3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {(() => { try { return new URL(tab.url).hostname; } catch { return tab.url; } })()}
          </div>
        )}
        {isFolder && (
          <div style={{ fontSize: 10, color: 'var(--vela-fg-muted)', marginTop: 3 }}>
            Carpeta
          </div>
        )}
      </div>
    </div>
  );
}

// ─── toolbar icons ────────────────────────────────────────────────────────────

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

const iconBtn = (active?: boolean): React.CSSProperties => ({
  padding: '5px 8px', borderRadius: 6, cursor: 'default',
  border: active ? '1px solid var(--vela-accent)' : '1px solid var(--vela-border)',
  background: active ? 'var(--vela-accent)' : 'var(--vela-bg-row-hover)',
  color: active ? '#fff' : 'var(--vela-fg)',
  display: 'flex', alignItems: 'center',
});

// ─── main app ─────────────────────────────────────────────────────────────────

export function App() {
  // URL params
  const params = new URLSearchParams(window.location.search);
  const rootFolderId = params.get('folderId') ?? '';
  const workspaceId = params.get('workspaceId') ?? '';

  const [allNodes, setAllNodes] = useState<TreeNode[]>([]);
  const [folderStack, setFolderStack] = useState<string[]>([rootFolderId]);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(
    () => (localStorage.getItem('vela:folder-view:mode') as 'list' | 'grid' | null) ?? 'grid',
  );

  const currentFolderId = folderStack[folderStack.length - 1] ?? rootFolderId;

  // Load theme and data
  useEffect(() => {
    themeManager.initialize();
    return () => themeManager.destroy();
  }, []);

  const loadTree = useCallback(async () => {
    if (!workspaceId) return;
    const res = await window.api.tree.getByWorkspace({ workspaceId });
    if (res.ok) setAllNodes(res.data);
  }, [workspaceId]);

  useEffect(() => {
    void loadTree();
    const off = window.api.on(IPC_EVENTS.TREE_CHANGED, (payload) => {
      if (payload.workspaceId === workspaceId) void loadTree();
    });
    return off;
  }, [loadTree, workspaceId]);

  // Derived: current folder node and its children
  const currentFolder = allNodes.find((n) => n.id === currentFolderId);
  const folderColor = currentFolder?.color ?? null;
  const folderName = currentFolder?.name ?? 'Carpeta';
  const folderIcon = currentFolder?.icon ?? null;

  const children = allNodes
    .filter((n) => n.parentId === currentFolderId)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));

  const filtered = query.trim()
    ? children.filter((n) => {
        const name = n.kind === 'tab' ? deriveTabTitle(n as TabNode) : (n.name ?? 'Carpeta');
        const lower = query.toLowerCase();
        return name.toLowerCase().includes(lower) ||
          (n.kind === 'tab' && (n as TabNode).url.toLowerCase().includes(lower));
      })
    : children;

  const handleItemClick = useCallback(async (node: TreeNode) => {
    if (node.kind === 'tab') {
      const tab = node as TabNode;
      if (tab.workspaceId !== workspaceId) {
        await window.api.workspaces.setActive({ id: tab.workspaceId });
      }
      await window.api.tab.activate({ id: tab.id });
    } else {
      setFolderStack((prev) => [...prev, node.id]);
      setQuery('');
    }
  }, [workspaceId]);

  const handleBack = useCallback(() => {
    setFolderStack((prev) => prev.slice(0, -1));
    setQuery('');
  }, []);

  const canGoBack = folderStack.length > 1;

  // Dynamic background tint
  const bgStyle: React.CSSProperties = folderColor
    ? { '--folder-tint': folderColor } as React.CSSProperties
    : {};

  const headerBg = folderColor
    ? `color-mix(in srgb, ${folderColor} 20%, var(--vela-bg-app))`
    : 'var(--vela-bg-app)';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
      background: 'var(--vela-bg-app)', color: 'var(--vela-fg)',
      ...bgStyle,
    }}>
      {/* Header */}
      <div style={{
        padding: canGoBack ? '12px 20px 8px' : '20px 20px 8px',
        flexShrink: 0, background: headerBg,
        borderBottom: '1px solid var(--vela-border)',
      }}>
        {canGoBack && (
          <button
            type="button"
            onClick={handleBack}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'transparent', border: 'none', cursor: 'default',
              color: 'var(--vela-fg-muted)', fontSize: 12, padding: '0 0 8px 0',
            }}
          >
            ← Volver
          </button>
        )}
        <h1 style={{
          margin: 0, fontSize: 20, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {folderIcon && (
            <span style={{ fontSize: 20, lineHeight: 1, userSelect: 'none' }}>{folderIcon}</span>
          )}
          {folderName}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--vela-fg-muted)' }}>
          {filtered.length} {filtered.length === 1 ? 'elemento' : 'elementos'}
        </p>
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 20px', flexShrink: 0,
        background: 'var(--vela-bg-app)',
        borderBottom: '1px solid var(--vela-border)',
      }}>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar…"
          autoFocus
          style={{
            flex: 1, background: 'var(--vela-suggestion-bg)',
            border: '1px solid var(--vela-addressbar-border)',
            borderRadius: 8, padding: '5px 10px',
            fontSize: 13, color: 'var(--vela-fg)', outline: 'none',
          }}
        />
        <button type="button" onClick={() => { setViewMode('grid'); localStorage.setItem('vela:folder-view:mode', 'grid'); }} title="Vista cuadrícula" style={iconBtn(viewMode === 'grid')}>
          <IcoGrid />
        </button>
        <button type="button" onClick={() => { setViewMode('list'); localStorage.setItem('vela:folder-view:mode', 'list'); }} title="Vista lista" style={iconBtn(viewMode === 'list')}>
          <IcoList />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 120, color: 'var(--vela-fg-muted)', fontSize: 13,
          }}>
            {query ? 'Sin resultados' : 'Carpeta vacía'}
          </div>
        ) : viewMode === 'list' ? (
          filtered.map((node) => (
            <ListItem key={node.id} node={node} onClick={() => void handleItemClick(node)} />
          ))
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, padding: 20 }}>
            {filtered.map((node) => (
              <GridItem key={node.id} node={node} onClick={() => void handleItemClick(node)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

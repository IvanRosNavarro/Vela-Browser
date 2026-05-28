import { useCallback, useEffect, useState } from 'react';
import { IPC_EVENTS } from '@vela/shared';
import type { TabNode } from '@vela/shared';

function AnchorRow({
  node,
  onRemove,
  onRename,
  onRestore,
  onReplace,
}: {
  node: TabNode;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onRestore: (id: string) => void;
  onReplace: (id: string) => void;
}) {
  const hasDrift = node.anchoredUrl !== null && node.url !== node.anchoredUrl;
  const title = node.name || node.originalTitle || node.url;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  function commitRename() {
    setEditing(false);
    if (draft.trim() && draft !== title) {
      onRename(node.id, draft.trim());
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderBottom: '1px solid var(--vela-border)',
      }}
    >
      {node.favicon && (
        <img
          src={node.favicon}
          alt=""
          width={16}
          height={16}
          style={{ flexShrink: 0, borderRadius: 2 }}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus
            value={draft}
            style={{
              width: '100%',
              background: 'var(--vela-suggestion-bg)',
              border: '1px solid var(--vela-accent)',
              borderRadius: 4,
              color: 'var(--vela-fg)',
              padding: '2px 6px',
              fontSize: 13,
            }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setEditing(false); setDraft(title); }
            }}
          />
        ) : (
          <div
            style={{ fontSize: 13, fontWeight: 500, cursor: 'text' }}
            onDoubleClick={() => setEditing(true)}
          >
            {title}
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--vela-fg-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hasDrift ? (
            <>
              <span style={{ color: 'var(--vela-warning, #f59e0b)' }}>Derivado: </span>
              {node.url}
            </>
          ) : (
            node.url
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {hasDrift && (
          <>
            <button
              type="button"
              title="Restaurar Ancla"
              style={btnStyle}
              onClick={() => onRestore(node.id)}
            >
              Restaurar
            </button>
            <button
              type="button"
              title="Reemplazar Ancla"
              style={btnStyle}
              onClick={() => onReplace(node.id)}
            >
              Reemplazar
            </button>
          </>
        )}
        <button
          type="button"
          title="Levar Ancla"
          style={{ ...btnStyle, color: 'var(--vela-danger, #ef4444)' }}
          onClick={() => onRemove(node.id)}
        >
          Levar Ancla
        </button>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: '2px 8px',
  borderRadius: 4,
  border: '1px solid var(--vela-border)',
  background: 'var(--vela-suggestion-bg)',
  color: 'var(--vela-fg)',
  fontSize: 11,
  cursor: 'default',
};

export function AnchorsLayout() {
  const [anchoredTabs, setAnchoredTabs] = useState<TabNode[]>([]);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const res = await window.api.tab.listAnchored();
    if (res.ok) setAnchoredTabs(res.data);
  }, []);

  useEffect(() => {
    void load();
    const off = window.api.on(IPC_EVENTS.ANCHORED_TABS_CHANGED, (payload) => {
      setAnchoredTabs(payload.tabs);
    });
    return off;
  }, [load]);

  const filtered = anchoredTabs
    .filter((n) => {
      if (!query) return true;
      const q = query.toLowerCase();
      const title = n.name || n.originalTitle || '';
      return (
        title.toLowerCase().includes(q) ||
        n.url.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => (a.position < b.position ? -1 : 1));

  async function handleRemove(id: string) {
    await window.api.tab.unanchor({ id });
  }

  async function handleRename(id: string, name: string) {
    await window.api.node.rename({ id, name });
  }

  async function handleRestore(id: string) {
    await window.api.tab.restoreAnchoredUrl({ id });
  }

  async function handleReplace(id: string) {
    await window.api.tab.replaceAnchoredUrl({ id });
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--vela-bg-app)',
        color: 'var(--vela-fg)',
      }}
    >
      <div
        style={{
          padding: '20px 20px 8px',
          flexShrink: 0,
          borderBottom: '1px solid var(--vela-border)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Anclas</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--vela-fg-muted)' }}>
          {anchoredTabs.length} {anchoredTabs.length === 1 ? 'ancla' : 'anclas'}
        </p>
      </div>

      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--vela-border)', flexShrink: 0 }}>
        <input
          type="search"
          placeholder="Buscar anclas..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '4px 10px',
            borderRadius: 6,
            border: '1px solid var(--vela-border)',
            background: 'var(--vela-suggestion-bg)',
            color: 'var(--vela-fg)',
            fontSize: 13,
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--vela-fg-muted)', fontSize: 13 }}>
            {query ? 'No se encontraron anclas' : 'Sin anclas. Usa el icono ⚓ en la barra de direcciones para anclar una página.'}
          </div>
        ) : (
          filtered.map((node) => (
            <AnchorRow
              key={node.id}
              node={node}
              onRemove={(id) => void handleRemove(id)}
              onRename={(id, name) => void handleRename(id, name)}
              onRestore={(id) => void handleRestore(id)}
              onReplace={(id) => void handleReplace(id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

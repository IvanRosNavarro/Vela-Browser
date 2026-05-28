import { useState, useEffect, useCallback, useMemo } from 'react';
import type { VaultEntry, VaultEntrySummary } from '@vela/shared';
import { PasswordsList } from './components/PasswordsList';
import { PasswordDetail } from './components/PasswordDetail';
import { PasswordGenerator } from './components/PasswordGenerator';
import { SecurityAudit } from './components/SecurityAudit';
import { FolderSidebar } from './components/FolderSidebar';

type Tab = 'passwords' | 'audit';

export function App() {
  const [entries, setEntries] = useState<VaultEntrySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<VaultEntry | null>(null);
  const [folders, setFolders] = useState<string[]>(['General']);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('passwords');
  const [showGenerator, setShowGenerator] = useState(false);

  const loadEntries = useCallback(async () => {
    const res = search
      ? await window.api.vault.search({ query: search })
      : await window.api.vault.list();
    if (res.ok) setEntries(res.data);
    const fRes = await window.api.vault.listFolders();
    if (fRes.ok) setFolders(fRes.data.length > 0 ? fRes.data : ['General']);
  }, [search]);

  useEffect(() => { void loadEntries(); }, [loadEntries]);

  const loadDetail = useCallback(async (id: string) => {
    const res = await window.api.vault.retrieve({ id });
    if (res.ok) setSelectedEntry(res.data);
  }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setSelectedEntry(null);
  }, [selectedId, loadDetail]);

  const filtered = useMemo(() => {
    return activeFolder ? entries.filter((e) => e.folder === activeFolder) : entries;
  }, [entries, activeFolder]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar esta entrada?')) return;
    const res = await window.api.vault.delete({ id });
    if (res.ok) {
      if (selectedId === id) setSelectedId(null);
      void loadEntries();
    }
  }, [selectedId, loadEntries]);

  const handleUpdate = useCallback(async (id: string, patch: Partial<VaultEntry>) => {
    const res = await window.api.vault.update({ id, ...patch, notes: patch.notes ?? undefined, loginUrl: patch.loginUrl ?? undefined });
    if (res.ok) {
      setSelectedEntry(res.data);
      void loadEntries();
    }
  }, [loadEntries]);

  const handleImport = useCallback(async () => {
    const res = await window.api.vault.importCsv();
    if (res.ok) {
      alert(`Importadas: ${res.data.imported}. Omitidas (duplicadas): ${res.data.skipped}.`);
      void loadEntries();
    }
  }, [loadEntries]);

  const handleExport = useCallback(async () => {
    const pwd = prompt('Introduce una contraseña de protección para el archivo exportado (obligatorio):');
    if (!pwd) return;
    await window.api.vault.exportVault({ protectionPassword: pwd });
  }, []);

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--vela-bg)' }}>
      {/* Left sidebar - folders */}
      <FolderSidebar
        folders={folders}
        activeFolder={activeFolder}
        onSelectFolder={setActiveFolder}
        tab={tab}
        onTabChange={setTab}
      />

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {tab === 'passwords' ? (
          <>
            {/* Toolbar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderBottom: '1px solid var(--vela-border)',
              background: 'var(--vela-bg-surface)',
            }}>
              <input
                type="search"
                placeholder="Buscar contraseñas…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  background: 'var(--vela-bg)',
                  border: '1px solid var(--vela-border)',
                  borderRadius: 6,
                  color: 'var(--vela-fg)',
                  padding: '5px 10px',
                  outline: 'none',
                  fontSize: 12,
                }}
              />
              <button
                type="button"
                onClick={() => setShowGenerator(!showGenerator)}
                title="Generador de contraseñas"
                style={toolbarBtnStyle}
              >
                🎲 Generar
              </button>
              <button type="button" onClick={() => void handleImport()} style={toolbarBtnStyle}>
                ⬆ Importar
              </button>
              <button type="button" onClick={() => void handleExport()} style={toolbarBtnStyle}>
                ⬇ Exportar
              </button>
            </div>

            <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
              {/* List */}
              <PasswordsList
                entries={filtered}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onDelete={handleDelete}
              />

              {/* Detail + Generator */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--vela-border)', minWidth: 0 }}>
                {showGenerator && (
                  <PasswordGenerator onUsePassword={(pwd) => {
                    if (selectedEntry) void handleUpdate(selectedEntry.id, { password: pwd });
                    setShowGenerator(false);
                  }} />
                )}
                {selectedEntry ? (
                  <PasswordDetail
                    entry={selectedEntry}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ color: 'var(--vela-fg-muted)', fontSize: 13 }}>
                      Selecciona una entrada para ver los detalles
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <SecurityAudit entries={entries} />
        )}
      </div>
    </div>
  );
}

const toolbarBtnStyle: React.CSSProperties = {
  background: 'var(--vela-bg)',
  border: '1px solid var(--vela-border)',
  borderRadius: 6,
  color: 'var(--vela-fg)',
  fontSize: 11,
  padding: '4px 10px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

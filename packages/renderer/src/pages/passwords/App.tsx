import { useState, useEffect, useCallback, useMemo } from 'react';
import type { VaultEntry, VaultEntrySummary, VaultSaveInput } from '@vela/shared';
import { PasswordsList } from './components/PasswordsList';
import { PasswordDetail } from './components/PasswordDetail';
import { PasswordGenerator } from './components/PasswordGenerator';
import { NewEntryForm } from './components/NewEntryForm';
import { SecurityAudit } from './components/SecurityAudit';
import { FolderSidebar, type VaultView } from './components/FolderSidebar';
import { AddressesView } from './components/AddressesView';
import { CardsView } from './components/CardsView';
import { ExportDialog } from './components/ExportDialog';

type Tab = VaultView;

// vela://passwords?view=addresses|cards abre directamente esa vista (lo usa el
// enlace "Gestionar…" del popup de autorrelleno).
function initialView(): Tab {
  const view = new URLSearchParams(window.location.search).get('view');
  return view === 'addresses' || view === 'cards' || view === 'audit' ? view : 'passwords';
}

export function App() {
  const [entries, setEntries] = useState<VaultEntrySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<VaultEntry | null>(null);
  const [folders, setFolders] = useState<string[]>(['General']);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>(initialView);
  const [showGenerator, setShowGenerator] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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

  const handleCreate = useCallback(async (input: VaultSaveInput) => {
    const res = await window.api.vault.save(input);
    if (res.ok) {
      setIsCreatingNew(false);
      await loadEntries();
      setSelectedId(res.data.id);
    }
  }, [loadEntries]);

  const handleImport = useCallback(async () => {
    const res = await window.api.vault.importCsv();
    if (res.ok) {
      alert(`Importadas: ${res.data.imported}. Omitidas (duplicadas): ${res.data.skipped}.`);
      void loadEntries();
    }
  }, [loadEntries]);

  const handleExport = useCallback(async (protectionPassword: string) => {
    const res = await window.api.vault.exportVault({ protectionPassword });
    setShowExport(false);
    if (!res.ok) {
      setNotice('No se ha podido exportar el fichero.');
      return;
    }
    if (res.data.saved) setNotice(`Contraseñas exportadas a ${res.data.filePath ?? 'el fichero elegido'}.`);
  }, []);

  // El aviso de la barra se retira solo; no hay toaster en esta página.
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);

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
                onClick={() => { setIsCreatingNew(true); setSelectedId(null); setShowGenerator(false); }}
                style={{ ...toolbarBtnStyle, background: 'var(--vela-accent)', color: '#fff', border: 'none', fontWeight: 500 }}
              >
                + Nueva contraseña
              </button>
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
              <button type="button" onClick={() => setShowExport(true)} style={toolbarBtnStyle}>
                ⬇ Exportar
              </button>
            </div>

            {notice && (
              <div style={{
                padding: '6px 16px',
                fontSize: 11,
                color: 'var(--vela-fg-muted)',
                borderBottom: '1px solid var(--vela-border)',
                background: 'var(--vela-bg-surface)',
              }}>
                {notice}
              </div>
            )}

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
                {isCreatingNew ? (
                  <NewEntryForm
                    folders={folders}
                    onCreate={handleCreate}
                    onCancel={() => setIsCreatingNew(false)}
                  />
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>
          </>
        ) : tab === 'addresses' ? (
          <AddressesView />
        ) : tab === 'cards' ? (
          <CardsView />
        ) : (
          <SecurityAudit entries={entries} />
        )}
      </div>

      {showExport && (
        <ExportDialog
          onCancel={() => setShowExport(false)}
          onConfirm={handleExport}
        />
      )}
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

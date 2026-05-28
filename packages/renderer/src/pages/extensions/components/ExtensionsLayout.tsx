import { useState, useCallback, useMemo } from 'react';
import type { InstalledExtension } from '@vela/shared';
import { Download } from 'lucide-react';
import { ExtensionCard } from './ExtensionCard';
import { ExtensionDetail } from './ExtensionDetail';
import { EmptyState } from './EmptyState';
import { useInstallFromCrx, InstallFeedback } from './InstallFromCrx';

type Filter = 'all' | 'active' | 'inactive';

interface Props {
  extensions: InstalledExtension[];
  loading: boolean;
  onRefresh(): Promise<void>;
  onExtensionsChange(exts: InstalledExtension[]): void;
}

const TABS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'active', label: 'Activas' },
  { key: 'inactive', label: 'Inactivas' },
];

export function ExtensionsLayout({ extensions, loading, onRefresh, onExtensionsChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const selectedExt = extensions.find((e) => e.id === selectedId) ?? null;

  const counts = useMemo(() => ({
    all: extensions.length,
    active: extensions.filter((e) => e.enabled).length,
    inactive: extensions.filter((e) => !e.enabled).length,
  }), [extensions]);

  const filteredExtensions = useMemo(() => {
    let result = extensions;
    if (filter === 'active') result = result.filter((e) => e.enabled);
    if (filter === 'inactive') result = result.filter((e) => !e.enabled);
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q),
      );
    }
    return result;
  }, [extensions, filter, query]);

  const handleSelectExt = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleToggle = useCallback(async (ext: InstalledExtension, enabled: boolean) => {
    const res = enabled
      ? await window.api.extensions.enable({ extensionId: ext.id })
      : await window.api.extensions.disable({ extensionId: ext.id });
    if (res.ok) {
      onExtensionsChange(extensions.map((e) => (e.id === ext.id ? { ...e, enabled } : e)));
    }
  }, [extensions, onExtensionsChange]);

  const handleUninstall = useCallback(async (id: string) => {
    const res = await window.api.extensions.uninstall({ extensionId: id });
    if (res.ok) {
      onExtensionsChange(extensions.filter((e) => e.id !== id));
      if (selectedId === id) setSelectedId(null);
    }
  }, [extensions, onExtensionsChange, selectedId]);

  const handleOpenOptions = useCallback(async (id: string) => {
    await window.api.extensions.openOptionsPage({ extensionId: id });
  }, []);

  const handleSetPinned = useCallback(async (ext: InstalledExtension, pinned: boolean) => {
    const res = await window.api.extensions.setPinned({ extensionId: ext.id, pinned });
    if (res.ok) {
      onExtensionsChange(extensions.map((e) => (e.id === ext.id ? { ...e, pinnedToBar: pinned } : e)));
    }
  }, [extensions, onExtensionsChange]);

  const handleSetSecureAllowed = useCallback(async (ext: InstalledExtension, allowed: boolean) => {
    const res = await window.api.extensions.setSecureAllowed({ extensionId: ext.id, allowed });
    if (res.ok) {
      onExtensionsChange(extensions.map((e) => (e.id === ext.id ? { ...e, allowedInSecureTabs: allowed } : e)));
    }
  }, [extensions, onExtensionsChange]);

  const handleInstallSuccess = useCallback((ext: InstalledExtension) => {
    onExtensionsChange([...extensions, ext]);
  }, [extensions, onExtensionsChange]);

  const { state: installState, install } = useInstallFromCrx(handleInstallSuccess);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--vela-bg-app)' }}>
      {/* ── Main column ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Header */}
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 0', flexShrink: 0,
        }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--vela-fg)' }}>
            Extensiones
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <InstallFeedback state={installState} />
            <button
              onClick={install}
              disabled={installState.kind === 'installing'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid var(--vela-border)',
                background: 'var(--vela-bg-row-hover, transparent)',
                color: 'var(--vela-fg)', fontSize: 13,
                opacity: installState.kind === 'installing' ? 0.5 : 1,
              }}
            >
              <Download size={14} />
              Instalar .crx
            </button>
          </div>
        </header>

        {/* Toolbar: search + filter tabs */}
        <div style={{ padding: '14px 24px 0', flexShrink: 0 }}>
          <input
            type="search"
            placeholder="Buscar extensiones…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box', marginBottom: 14,
              background: 'var(--vela-suggestion-bg, var(--vela-surface-1))',
              border: '1px solid var(--vela-addressbar-border, var(--vela-border))',
              borderRadius: 8, padding: '7px 12px',
              fontSize: 13, color: 'var(--vela-fg)', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--vela-border)' }}>
            {TABS.map(({ key, label }) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '6px 14px 8px', border: 'none', cursor: 'pointer',
                    borderBottom: active ? '2px solid var(--vela-accent)' : '2px solid transparent',
                    background: 'transparent',
                    color: active ? 'var(--vela-accent)' : 'var(--vela-fg-muted)',
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    marginBottom: -1,
                  }}
                >
                  {label}
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 10,
                    background: active ? 'var(--vela-accent)' : 'var(--vela-surface-2)',
                    color: active ? '#fff' : 'var(--vela-fg-muted)',
                  }}>
                    {counts[key]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* List */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '16px 24px 24px' }}>
          {loading ? (
            <div className="flex justify-center py-16">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--vela-accent)] border-t-transparent" />
            </div>
          ) : filteredExtensions.length === 0 ? (
            extensions.length === 0 ? (
              <EmptyState onInstall={install} />
            ) : (
              <div style={{ textAlign: 'center', paddingTop: 48, color: 'var(--vela-fg-muted)', fontSize: 13 }}>
                No se encontraron extensiones{query ? ` para «${query}»` : ''}.
              </div>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredExtensions.map((ext) => (
                <ExtensionCard
                  key={ext.id}
                  extension={ext}
                  selected={selectedId === ext.id}
                  onSelect={() => handleSelectExt(ext.id)}
                  onToggle={(enabled) => handleToggle(ext, enabled)}
                  onUninstall={() => void handleUninstall(ext.id)}
                  onOpenOptions={() => void handleOpenOptions(ext.id)}
                  onViewDetails={() => handleSelectExt(ext.id)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* ── Detail panel ─────────────────────────────────────────────────── */}
      {selectedExt && (
        <ExtensionDetail
          extension={selectedExt}
          onClose={() => setSelectedId(null)}
          onUninstall={(id) => void handleUninstall(id)}
          onOpenOptions={(id) => void handleOpenOptions(id)}
          onToggle={(enabled) => handleToggle(selectedExt, enabled)}
          onSetPinned={(pinned) => handleSetPinned(selectedExt, pinned)}
          onSetSecureAllowed={(allowed) => handleSetSecureAllowed(selectedExt, allowed)}
        />
      )}
    </div>
  );
}

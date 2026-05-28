import { useCallback, useEffect, useState } from 'react';
import type { UserScript } from '@vela/shared';
import { IPC_EVENTS } from '@vela/shared';
import type { ScriptError } from '@vela/shared';
import { ScriptsList } from './ScriptsList';
import { ScriptEditor } from './ScriptEditor';
import { ScriptImporter } from './ScriptImporter';
import { ScriptErrors } from './ScriptErrors';

type View = 'list' | 'editor' | 'importer';

export function ScriptsLayout() {
  const [scripts, setScripts] = useState<UserScript[]>([]);
  const [errors, setErrors] = useState<ScriptError[]>([]);
  const [view, setView] = useState<View>('list');
  const [editingScript, setEditingScript] = useState<UserScript | null>(null);
  const [importPreview, setImportPreview] = useState<{ name: string; description: string; code: string; matchPatterns: string[]; runAt: 'document-start' | 'document-end' | 'document-idle' } | null>(null);

  const loadScripts = useCallback(async () => {
    const res = await window.api.scripts.list();
    if (res.ok) setScripts(res.data);
  }, []);

  useEffect(() => {
    void loadScripts();
    const off = window.api.on(IPC_EVENTS.SCRIPT_ERROR, (payload) => {
      setErrors((prev) => {
        const updated = [payload as ScriptError, ...prev];
        return updated.slice(0, 100);
      });
    });
    return off;
  }, [loadScripts]);

  function handleNew() {
    setEditingScript(null);
    setImportPreview(null);
    setView('editor');
  }

  function handleEdit(script: UserScript) {
    setEditingScript(script);
    setImportPreview(null);
    setView('editor');
  }

  function handleImportClick() {
    setEditingScript(null);
    setImportPreview(null);
    setView('importer');
  }

  function handleImportReady(meta: { name: string; description: string; code: string; matchPatterns: string[]; runAt: 'document-start' | 'document-end' | 'document-idle' }) {
    setImportPreview(meta);
    setView('editor');
  }

  async function handleSave(data: {
    name: string;
    description: string;
    type: 'js' | 'css';
    code: string;
    matchPatterns: string[];
    enabled: boolean;
    runAt: 'document-start' | 'document-end' | 'document-idle';
  }) {
    if (editingScript) {
      await window.api.scripts.update({ id: editingScript.id, data });
    } else {
      await window.api.scripts.add(data);
    }
    await loadScripts();
    setView('list');
  }

  async function handleDelete(id: string) {
    await window.api.scripts.delete({ id });
    await loadScripts();
  }

  async function handleToggle(id: string, enabled: boolean) {
    await window.api.scripts.toggle({ id, enabled });
    setScripts((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
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
        fontFamily: 'var(--vela-font-sans, system-ui)',
      }}
    >
      {/* Banner de seguridad */}
      <div
        style={{
          background: '#b45309',
          color: '#fef3c7',
          padding: '8px 20px',
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        ⚠ Los scripts de usuario tienen acceso al DOM y al JavaScript de las páginas donde se ejecutan. Instala solo scripts de fuentes de confianza.
      </div>

      {/* Cabecera */}
      <div
        style={{
          padding: '16px 20px 12px',
          borderBottom: '1px solid var(--vela-border)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {view !== 'list' && (
          <button
            onClick={() => setView('list')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--vela-fg-muted)',
              fontSize: 20,
              padding: '0 4px',
              lineHeight: 1,
            }}
            title="Volver"
          >
            ←
          </button>
        )}
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
            {view === 'list' && 'Scripts de usuario'}
            {view === 'editor' && (editingScript ? 'Editar script' : 'Nuevo script')}
            {view === 'importer' && 'Importar desde URL'}
          </h1>
          {view === 'list' && (
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--vela-fg-muted)' }}>
              {scripts.length} {scripts.length === 1 ? 'script' : 'scripts'}
            </p>
          )}
        </div>
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'list' && (
          <ScriptsList
            scripts={scripts}
            errors={errors}
            onNew={handleNew}
            onEdit={handleEdit}
            onDelete={(id) => void handleDelete(id)}
            onToggle={(id, enabled) => void handleToggle(id, enabled)}
            onImport={handleImportClick}
            onClearErrors={() => setErrors([])}
          />
        )}
        {view === 'editor' && (
          <ScriptEditor
            initial={editingScript ?? (importPreview
              ? { ...importPreview, type: 'js', enabled: true }
              : null)}
            onSave={(data) => void handleSave(data)}
            onCancel={() => setView('list')}
          />
        )}
        {view === 'importer' && (
          <ScriptImporter
            onReady={handleImportReady}
            onCancel={() => setView('list')}
          />
        )}
      </div>
    </div>
  );
}

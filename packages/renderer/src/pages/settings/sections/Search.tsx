import { useState, useEffect } from 'react';
import { BUILTIN_ENGINE_ALIASES, type CustomEngineAlias } from '@vela/shared';
import { call } from '../../../lib/ipc';
import type { useSettings } from '../lib/useSettings';
import { SettingRow, SettingSection } from '../components/SettingRow';
import { Toggle } from '../components/controls/Toggle';
import { Select, type SelectOption } from '../components/controls/Select';

type SearchEngine = 'duckduckgo' | 'google' | 'bing' | 'startpage' | 'kagi' | 'custom';

const ENGINE_OPTIONS: SelectOption<SearchEngine>[] = [
  { value: 'duckduckgo', label: 'DuckDuckGo' },
  { value: 'google',     label: 'Google' },
  { value: 'bing',       label: 'Bing' },
  { value: 'startpage',  label: 'Startpage' },
  { value: 'kagi',       label: 'Kagi' },
  { value: 'custom',     label: 'Personalizado' },
];

const inputClass =
  'rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-app)] px-2 py-1 text-sm text-[var(--vela-fg)] outline-none focus:border-[var(--vela-accent)]';

const codeStyle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'monospace',
  padding: '1px 5px',
  borderRadius: 3,
  background: 'var(--vela-bg-sidebar-elev)',
  border: '1px solid var(--vela-border)',
  color: 'var(--vela-accent)',
};

function CustomEnginesSection() {
  const [engines, setEngines] = useState<CustomEngineAlias[]>([]);
  const [newAlias, setNewAlias] = useState('!');
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      const res = await call(() => window.api.searchEngines.getCustomEngines());
      setEngines(res);
    })();
  }, []);

  const handleAdd = async (): Promise<void> => {
    setError('');
    if (!newAlias.startsWith('!') || newAlias.trim().length < 2) {
      setError('El alias debe empezar con ! y tener al menos un carácter más.');
      return;
    }
    if (!newName.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (!newUrl.includes('%s')) {
      setError('La URL debe contener %s como marcador del término de búsqueda.');
      return;
    }
    try {
      await call(() =>
        window.api.searchEngines.setCustomEngine({
          alias: newAlias.trim(),
          name: newName.trim(),
          url: newUrl.trim(),
        }),
      );
      const res = await call(() => window.api.searchEngines.getCustomEngines());
      setEngines(res);
      setNewAlias('!');
      setNewName('');
      setNewUrl('');
    } catch {
      setError('Error al guardar. Comprueba que el alias no esté duplicado.');
    }
  };

  const handleDelete = async (alias: string): Promise<void> => {
    try {
      await call(() => window.api.searchEngines.deleteCustomEngine(alias));
      setEngines((prev) => prev.filter((e) => e.alias !== alias));
    } catch {
      // silencioso
    }
  };

  return (
    <div className="px-4 py-4 flex flex-col gap-4">
      {/* Built-in aliases reference */}
      <div>
        <p className="text-xs text-[var(--vela-fg-muted)] mb-2">
          Alias integrados — escribe{' '}
          <code style={codeStyle}>!alias consulta</code> en la barra de
          direcciones.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {BUILTIN_ENGINE_ALIASES.map((e) => (
              <tr key={e.alias}>
                <td style={{ padding: '2px 12px 2px 0', width: 72 }}>
                  <code style={codeStyle}>{e.alias}</code>
                </td>
                <td style={{ padding: '2px 0', color: 'var(--vela-fg)' }}>
                  {e.name}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* User custom aliases */}
      {engines.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[var(--vela-fg-muted)] mb-2">
            Alias personalizados
          </p>
          <table
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}
          >
            <thead>
              <tr
                className="text-[var(--vela-fg-muted)]"
                style={{ textAlign: 'left' }}
              >
                <th style={{ padding: '2px 12px 2px 0', fontWeight: 500, width: 80 }}>
                  Alias
                </th>
                <th style={{ padding: '2px 12px 2px 0', fontWeight: 500, width: 140 }}>
                  Nombre
                </th>
                <th style={{ padding: '2px 12px 2px 0', fontWeight: 500 }}>
                  URL
                </th>
                <th style={{ width: 28 }} />
              </tr>
            </thead>
            <tbody>
              {engines.map((e) => (
                <tr key={e.alias} className="border-t border-[var(--vela-border)]">
                  <td style={{ padding: '4px 12px 4px 0' }}>
                    <code style={codeStyle}>{e.alias}</code>
                  </td>
                  <td style={{ padding: '4px 12px 4px 0', color: 'var(--vela-fg)' }}>
                    {e.name}
                  </td>
                  <td
                    style={{
                      padding: '4px 12px 4px 0',
                      color: 'var(--vela-fg-muted)',
                      fontSize: 11,
                      maxWidth: 240,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={e.url}
                  >
                    {e.url}
                  </td>
                  <td style={{ padding: '4px 0', textAlign: 'center' }}>
                    <button
                      type="button"
                      title="Eliminar alias"
                      onClick={() => void handleDelete(e.alias)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--vela-fg-muted)',
                        fontSize: 16,
                        lineHeight: 1,
                        padding: '0 4px',
                        borderRadius: 4,
                      }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add new alias form */}
      <div>
        <p className="text-xs font-medium text-[var(--vela-fg-muted)] mb-2">
          Añadir alias
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <input
            type="text"
            placeholder="!alias"
            value={newAlias}
            onChange={(e) => setNewAlias(e.target.value)}
            className={inputClass}
            style={{ width: 80 }}
          />
          <input
            type="text"
            placeholder="Nombre"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className={inputClass}
            style={{ width: 130 }}
          />
          <input
            type="url"
            placeholder="https://…?q=%s"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className={inputClass}
            style={{ width: 220 }}
          />
          <button
            type="button"
            onClick={() => void handleAdd()}
            className="rounded-md px-3 py-1 text-sm font-medium"
            style={{
              background: 'var(--vela-accent)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Añadir
          </button>
        </div>
        {error && (
          <p className="mt-2 text-xs" style={{ color: 'var(--vela-error, #ef4444)' }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

interface Props {
  settings: ReturnType<typeof useSettings>;
}

export function Search({ settings }: Props) {
  const { get, set } = settings;
  const engine = get<SearchEngine>('search:engine', 'duckduckgo');

  return (
    <>
      <SettingSection title="Motor de búsqueda">
        <SettingRow label="Motor por defecto">
          <Select<SearchEngine>
            value={engine}
            options={ENGINE_OPTIONS}
            onChange={(v) => void set('search:engine', v)}
          />
        </SettingRow>
        {engine === 'custom' && (
          <SettingRow
            label="URL del motor personalizado"
            description="Usa %s como marcador para el término de búsqueda."
          >
            <input
              type="url"
              placeholder="https://example.com/search?q=%s"
              value={get<string>('search:customUrl', '')}
              onChange={(e) => void set('search:customUrl', e.target.value)}
              className="w-64 rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-app)] px-2 py-1 text-sm text-[var(--vela-fg)] outline-none focus:border-[var(--vela-accent)]"
            />
          </SettingRow>
        )}
        <SettingRow
          label="Sugerencias de búsqueda"
          description="Muestra sugerencias en la barra de direcciones mientras escribes."
        >
          <Toggle
            value={get<boolean>('search:suggestions', true)}
            onChange={(v) => void set('search:suggestions', v)}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Alias de búsqueda">
        <CustomEnginesSection />
      </SettingSection>
    </>
  );
}

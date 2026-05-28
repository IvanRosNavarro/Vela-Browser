import { useCallback, useEffect, useState } from 'react';
import type { useSettings } from '../lib/useSettings';
import { SettingRow, SettingSection } from '../components/SettingRow';
import { Toggle } from '../components/controls/Toggle';

const LIST_OPTIONS: { key: string; label: string; description: string }[] = [
  { key: 'easylist', label: 'EasyList', description: 'Bloquea anuncios generales (recomendado).' },
  { key: 'easyprivacy', label: 'EasyPrivacy', description: 'Bloquea trackers y análisis (recomendado).' },
  { key: 'ublock', label: 'uBlock Origin Filters', description: 'Filtros adicionales de alta calidad.' },
];

const DEFAULT_LISTS = ['easylist', 'easyprivacy', 'ublock'];

interface Props {
  settings: ReturnType<typeof useSettings>;
}

export function AdBlocker({ settings }: Props) {
  const { get, set } = settings;

  const enabled = get<boolean>('adblocker:enabled', true);
  const activeLists = get<string[]>('adblocker:active-lists', DEFAULT_LISTS);
  const customLists = get<string[]>('adblocker:custom-lists', []);

  const [exceptions, setExceptions] = useState<string[]>([]);
  const [loadingUpdate, setLoadingUpdate] = useState(false);
  const [lastUpdatedStr, setLastUpdatedStr] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState('');

  const loadExceptions = useCallback(async () => {
    const res = await window.api.adblocker.listExceptions();
    if (res.ok) setExceptions(res.data);
  }, []);

  useEffect(() => {
    void loadExceptions();
  }, [loadExceptions]);

  const removeException = useCallback(async (domain: string) => {
    await window.api.adblocker.removeException({ domain });
    setExceptions((prev) => prev.filter((d) => d !== domain));
  }, []);

  const toggleList = useCallback((key: string, active: boolean) => {
    const next = active
      ? [...new Set([...activeLists, key])]
      : activeLists.filter((k) => k !== key);
    void set('adblocker:active-lists', next);
  }, [activeLists, set]);

  const handleUpdateLists = useCallback(async () => {
    setLoadingUpdate(true);
    await window.api.adblocker.updateLists();
    setLastUpdatedStr(new Date().toLocaleTimeString());
    setLoadingUpdate(false);
  }, []);

  const addCustomList = useCallback(() => {
    const url = customInput.trim();
    if (!url) return;
    try { new URL(url); } catch { return; }
    const next = [...new Set([...customLists, url])];
    void set('adblocker:custom-lists', next);
    setCustomInput('');
  }, [customInput, customLists, set]);

  const removeCustomList = useCallback((url: string) => {
    void set('adblocker:custom-lists', customLists.filter((u) => u !== url));
  }, [customLists, set]);

  return (
    <>
      <SettingSection title="Bloqueador de anuncios">
        <SettingRow
          label="Activar bloqueador de anuncios"
          description="Bloquea anuncios y trackers en tiempo real. Requiere reiniciar Vela si se activa tras abrirlo."
        >
          <Toggle
            value={enabled}
            onChange={(v) => void set('adblocker:enabled', v)}
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Listas de filtros activas">
        {LIST_OPTIONS.map((opt) => (
          <SettingRow
            key={opt.key}
            label={opt.label}
            description={opt.description}
          >
            <Toggle
              value={activeLists.includes(opt.key)}
              onChange={(v) => toggleList(opt.key, v)}
              disabled={!enabled}
            />
          </SettingRow>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
          {lastUpdatedStr && (
            <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)', flex: 1 }}>
              Actualizado: {lastUpdatedStr}
            </span>
          )}
          <button
            onClick={() => void handleUpdateLists()}
            disabled={!enabled || loadingUpdate}
            style={{
              padding: '5px 12px',
              borderRadius: 5,
              border: '1px solid var(--vela-border)',
              background: 'var(--vela-bg-elevated)',
              color: 'var(--vela-fg)',
              fontSize: 12,
              cursor: enabled && !loadingUpdate ? 'pointer' : 'default',
              opacity: !enabled || loadingUpdate ? 0.4 : 1,
            }}
          >
            {loadingUpdate ? 'Actualizando…' : 'Actualizar ahora'}
          </button>
        </div>
      </SettingSection>

      <SettingSection title="Listas personalizadas">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {customLists.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--vela-fg-muted)' }}>
              Sin listas personalizadas.
            </p>
          )}
          {customLists.map((url) => (
            <div
              key={url}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}
            >
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--vela-fg)',
                  fontFamily: 'monospace',
                  fontSize: 11,
                }}
                title={url}
              >
                {url}
              </span>
              <button
                onClick={() => removeCustomList(url)}
                style={{
                  flexShrink: 0,
                  padding: '2px 8px',
                  borderRadius: 4,
                  border: '1px solid var(--vela-border)',
                  background: 'none',
                  color: 'var(--vela-fg-muted)',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Eliminar
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input
              type="url"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="https://ejemplo.com/lista.txt"
              onKeyDown={(e) => { if (e.key === 'Enter') addCustomList(); }}
              style={{
                flex: 1,
                padding: '5px 8px',
                borderRadius: 5,
                border: '1px solid var(--vela-border)',
                background: 'var(--vela-bg-elevated)',
                color: 'var(--vela-fg)',
                fontSize: 12,
                outline: 'none',
              }}
            />
            <button
              onClick={addCustomList}
              disabled={!customInput.trim()}
              style={{
                flexShrink: 0,
                padding: '5px 12px',
                borderRadius: 5,
                border: '1px solid var(--vela-border)',
                background: 'var(--vela-bg-elevated)',
                color: 'var(--vela-fg)',
                fontSize: 12,
                cursor: customInput.trim() ? 'pointer' : 'default',
                opacity: customInput.trim() ? 1 : 0.4,
              }}
            >
              Añadir
            </button>
          </div>
        </div>
      </SettingSection>

      <SettingSection title="Excepciones de sitios">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {exceptions.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--vela-fg-muted)' }}>No hay excepciones.</p>
          )}
          {exceptions.map((domain) => (
            <div
              key={domain}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <span style={{ flex: 1, fontSize: 13, color: 'var(--vela-fg)' }}>{domain}</span>
              <button
                onClick={() => void removeException(domain)}
                style={{
                  padding: '3px 10px',
                  borderRadius: 4,
                  border: '1px solid var(--vela-border)',
                  background: 'none',
                  color: 'var(--vela-fg-muted)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      </SettingSection>
    </>
  );
}

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  DARKMODE_DEFAULTS,
  DARKMODE_INTENSITY_MAX,
  DARKMODE_INTENSITY_MIN,
  coerceDarkModeSettings,
  normalizeHostInput,
  type DarkModeMode,
  type DarkModeSiteOverrides,
} from '@vela/shared';
import { SettingRow, SettingSection } from '../components/SettingRow';
import { Select, type SelectOption } from '../components/controls/Select';
import { Slider } from '../components/controls/Slider';
import type { useSettings } from '../lib/useSettings';

const MODE_OPTIONS: SelectOption<DarkModeMode>[] = [
  { value: 'off', label: 'Desactivado' },
  { value: 'always', label: 'Siempre' },
  { value: 'follow-theme', label: 'Seguir el tema de Vela' },
];

const SITE_OPTIONS: SelectOption<'on' | 'off'>[] = [
  { value: 'on', label: 'Siempre oscuro' },
  { value: 'off', label: 'Nunca oscuro' },
];

interface Props {
  settings: ReturnType<typeof useSettings>;
}

/** Modo oscuro forzado de las webs (Dark Reader), en Apariencia. */
export function DarkModeSettings({ settings }: Props) {
  const { get, set } = settings;
  const dm = coerceDarkModeSettings({
    mode: get<unknown>('darkmode:web', DARKMODE_DEFAULTS.mode),
    brightness: get<unknown>('darkmode:brightness', DARKMODE_DEFAULTS.brightness),
    contrast: get<unknown>('darkmode:contrast', DARKMODE_DEFAULTS.contrast),
    sites: get<unknown>('darkmode:sites', {}),
  });
  const [hostInput, setHostInput] = useState('');
  const [hostError, setHostError] = useState('');

  const hosts = Object.keys(dm.sites).sort();

  function saveSites(next: DarkModeSiteOverrides) {
    void set('darkmode:sites', next);
  }

  function handleAdd() {
    const host = normalizeHostInput(hostInput);
    if (!host) {
      setHostError('Escribe un dominio válido, p. ej. example.com');
      return;
    }
    setHostError('');
    setHostInput('');
    // Por defecto, la excepción contraria a lo que haría el modo global.
    saveSites({ ...dm.sites, [host]: dm.mode === 'off' });
  }

  return (
    <SettingSection title="Modo oscuro en las webs">
      <SettingRow
        label="Oscurecer las páginas web"
        description="Usa Dark Reader para dar un tema oscuro a las webs que no lo tienen. Las que ya son oscuras se dejan como están."
      >
        <Select<DarkModeMode>
          value={dm.mode}
          options={MODE_OPTIONS}
          onChange={(v) => void set('darkmode:web', v)}
        />
      </SettingRow>
      <SettingRow label="Brillo" description="Porcentaje; 100 es el valor por defecto.">
        <Slider
          value={dm.brightness}
          min={DARKMODE_INTENSITY_MIN}
          max={DARKMODE_INTENSITY_MAX}
          step={5}
          onChange={(v) => void set('darkmode:brightness', v)}
        />
      </SettingRow>
      <SettingRow label="Contraste" description="Porcentaje; 100 es el valor por defecto.">
        <Slider
          value={dm.contrast}
          min={DARKMODE_INTENSITY_MIN}
          max={DARKMODE_INTENSITY_MAX}
          step={5}
          onChange={(v) => void set('darkmode:contrast', v)}
        />
      </SettingRow>

      <div className="px-4 py-3">
        <p className="text-sm text-[var(--vela-fg)]">Excepciones por sitio</p>
        <p className="mt-0.5 text-xs text-[var(--vela-fg-muted)]">
          Valen también para los subdominios. También se añaden con «Modo oscuro en este sitio» en
          el menú contextual de la página o desde la paleta de comandos.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={hostInput}
            onChange={(e) => setHostInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
            placeholder="example.com"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg)] px-2 py-1 text-sm text-[var(--vela-fg)] outline-none focus:border-[var(--vela-accent)]"
          />
          <button
            onClick={handleAdd}
            className="rounded bg-[var(--vela-accent)] px-3 py-1 text-xs text-[var(--vela-accent-fg)] hover:opacity-90"
          >
            Añadir
          </button>
        </div>
        {hostError && <p className="mt-1 text-xs text-[var(--vela-danger)]">{hostError}</p>}
      </div>

      {hosts.map((host) => (
        <div key={host} className="flex items-center justify-between gap-3 px-4 py-2">
          <span className="min-w-0 truncate font-mono text-xs text-[var(--vela-fg)]">{host}</span>
          <div className="flex shrink-0 items-center gap-2">
            <Select<'on' | 'off'>
              value={dm.sites[host] ? 'on' : 'off'}
              options={SITE_OPTIONS}
              onChange={(v) => saveSites({ ...dm.sites, [host]: v === 'on' })}
            />
            <button
              onClick={() => {
                const next = { ...dm.sites };
                delete next[host];
                saveSites(next);
              }}
              title="Quitar excepción"
              className="rounded p-1 text-[var(--vela-fg-muted)] hover:text-[var(--vela-danger)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </SettingSection>
  );
}

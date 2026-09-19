import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { SpellcheckInfo } from '@vela/shared';
import type { useSettings } from '../lib/useSettings';
import { SettingRow, SettingSection } from '../components/SettingRow';
import { Toggle } from '../components/controls/Toggle';
import { Select, type SelectOption } from '../components/controls/Select';

interface Props {
  settings: ReturnType<typeof useSettings>;
}

const languageNames = (() => {
  try {
    return new Intl.DisplayNames(['es'], { type: 'language' });
  } catch {
    return null;
  }
})();

function languageLabel(code: string): string {
  let name: string | undefined;
  try {
    name = languageNames?.of(code);
  } catch {
    name = undefined;
  }
  if (!name || name === code) return code;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

const ADD_PLACEHOLDER = '';

/**
 * Corrector ortográfico del perfil: interruptor y selección de idiomas. Los
 * cambios se guardan en `spellcheck:*` y el main los aplica en caliente a la
 * sesión del perfil; tras cada cambio se relee el estado efectivo para
 * mostrar los idiomas que Chromium está usando de verdad.
 */
export function SpellcheckSettings({ settings }: Props) {
  const { get, set } = settings;
  const [info, setInfo] = useState<SpellcheckInfo | null>(null);

  const refresh = useCallback(() => {
    void window.api.settings.getSpellcheckInfo().then((res) => {
      if (res.ok) setInfo(res.data);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enabled = get<boolean>('spellcheck:enabled', true);

  const setEnabled = useCallback(
    async (value: boolean) => {
      await set('spellcheck:enabled', value);
      refresh();
    },
    [set, refresh],
  );

  const setLanguages = useCallback(
    async (languages: string[] | null) => {
      await set('spellcheck:languages', languages);
      refresh();
    },
    [set, refresh],
  );

  const active = useMemo(() => info?.active ?? [], [info]);

  const addOptions = useMemo<SelectOption<string>[]>(() => {
    const remaining = (info?.available ?? [])
      .filter((code) => !active.includes(code))
      .map((code) => ({ value: code, label: `${languageLabel(code)} (${code})` }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
    return [{ value: ADD_PLACEHOLDER, label: 'Añadir idioma…' }, ...remaining];
  }, [info, active]);

  let description =
    'Subraya las palabras mal escritas en los campos de texto de las webs y ofrece correcciones con el clic derecho.';
  if (info?.downloadsDictionaries) {
    description +=
      ' En Linux, Vela descarga los diccionarios de los servidores de Google la primera vez que se usa cada idioma.';
  }

  return (
    <SettingSection title="Corrector ortográfico">
      <SettingRow label="Revisar la ortografía al escribir" description={description}>
        <Toggle value={enabled} onChange={(v) => void setEnabled(v)} />
      </SettingRow>

      {enabled && info?.systemManaged && (
        <SettingRow
          label="Idiomas"
          description="macOS usa el corrector del sistema, que detecta el idioma automáticamente."
        >
          <span className="text-sm text-[var(--vela-fg-muted)]">Del sistema</span>
        </SettingRow>
      )}

      {enabled && info && !info.systemManaged && (
        <>
          <SettingRow
            label="Idiomas del corrector"
            description={
              info.followsSystem
                ? 'Se usan los idiomas preferidos del sistema.'
                : window.api.platform === 'win32'
                  ? 'Elegidos a mano. En Windows solo aparecen los idiomas instalados en el sistema.'
                  : 'Elegidos a mano.'
            }
          >
            {!info.followsSystem && (
              <button
                onClick={() => void setLanguages(null)}
                className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-3 py-1 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50"
              >
                Usar los del sistema
              </button>
            )}
          </SettingRow>

          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            {active.length === 0 && (
              <span className="text-sm text-[var(--vela-fg-muted)]">
                No hay diccionarios disponibles en este equipo.
              </span>
            )}
            {active.map((code) => (
              <span
                key={code}
                className="flex items-center gap-1 rounded-full border border-[var(--vela-border)] bg-[var(--vela-bg-app)] py-0.5 pl-3 pr-1 text-sm text-[var(--vela-fg)]"
              >
                {languageLabel(code)}
                <button
                  type="button"
                  title="Quitar"
                  aria-label={`Quitar ${languageLabel(code)}`}
                  disabled={active.length <= 1}
                  onClick={() => void setLanguages(active.filter((c) => c !== code))}
                  className="rounded-full p-0.5 text-[var(--vela-fg-muted)] hover:bg-[var(--vela-border)]/50 hover:text-[var(--vela-fg)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {addOptions.length > 1 && (
              <Select<string>
                value={ADD_PLACEHOLDER}
                options={addOptions}
                onChange={(code) => {
                  if (code) void setLanguages([...active, code]);
                }}
              />
            )}
          </div>
        </>
      )}
    </SettingSection>
  );
}

import { useState, useEffect } from 'react';
import { ChevronRight, CheckCircle2 } from 'lucide-react';
import type { useSettings } from '../lib/useSettings';
import { SettingRow, SettingSection } from '../components/SettingRow';
import { Toggle } from '../components/controls/Toggle';
import { Select, type SelectOption } from '../components/controls/Select';
import type { TranslationSettings } from '@vela/shared';

declare const __APP_VERSION__: string;

const LANG_OPTIONS: SelectOption<string>[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'Inglés' },
  { value: 'fr', label: 'Francés' },
  { value: 'de', label: 'Alemán' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Portugués' },
  { value: 'ru', label: 'Ruso' },
  { value: 'zh', label: 'Chino (simplificado)' },
  { value: 'ja', label: 'Japonés' },
  { value: 'ko', label: 'Coreano' },
  { value: 'ar', label: 'Árabe' },
  { value: 'nl', label: 'Neerlandés' },
  { value: 'pl', label: 'Polaco' },
  { value: 'tr', label: 'Turco' },
  { value: 'uk', label: 'Ucraniano' },
];

type StartupPage = 'blank' | 'previous' | 'custom';

const STARTUP_PAGE_OPTIONS: SelectOption<StartupPage>[] = [
  { value: 'previous', label: 'Pestaña anterior' },
  { value: 'blank',    label: 'Página en blanco' },
  { value: 'custom',   label: 'URL personalizada' },
];

interface Props {
  settings: ReturnType<typeof useSettings>;
}

export function General({ settings }: Props) {
  const { get, set } = settings;
  const [isDefault, setIsDefault] = useState<boolean | null>(null);
  const [settingDefault, setSettingDefault] = useState(false);

  const [transSettings, setTransSettings] = useState<TranslationSettings | null>(null);
  useEffect(() => {
    void window.api.translation.getSettings().then((res) => {
      if (res.ok) setTransSettings(res.data);
    });
  }, []);

  async function saveTransSetting(partial: Partial<TranslationSettings>): Promise<void> {
    const res = await window.api.translation.saveSettings(partial);
    if (res.ok) setTransSettings(res.data);
  }
  useEffect(() => {
    void window.api.defaultBrowser.getStatus().then((res) => {
      if (res.ok) setIsDefault(res.data.isDefault);
    });
  }, []);

  async function setAsDefault() {
    setSettingDefault(true);
    try {
      await window.api.defaultBrowser.set();
      const res = await window.api.defaultBrowser.getStatus();
      if (res.ok) setIsDefault(res.data.isDefault);
    } finally {
      setSettingDefault(false);
    }
  }

  function checkNow() {
    void window.api.update.checkNow();
  }

  const startupPage = get<StartupPage>('startup:page', 'previous');

  return (
    <>
      <SettingSection title="Inicio">
        <SettingRow
          label="Restaurar pestañas al arrancar"
          description="Reabre las últimas pestañas abiertas al iniciar Vela."
        >
          <Toggle
            value={get<boolean>('startup:restore-tabs', true)}
            onChange={(v) => void set('startup:restore-tabs', v)}
          />
        </SettingRow>
        <SettingRow label="Página de inicio">
          <Select<StartupPage>
            value={startupPage}
            options={STARTUP_PAGE_OPTIONS}
            onChange={(v) => void set('startup:page', v)}
          />
        </SettingRow>
        {startupPage === 'custom' && (
          <SettingRow label="URL de inicio">
            <input
              type="url"
              placeholder="https://example.com"
              value={get<string>('startup:custom-url', '')}
              onChange={(e) => void set('startup:custom-url', e.target.value)}
              className="w-56 rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-app)] px-2 py-1 text-sm text-[var(--vela-fg)] outline-none focus:border-[var(--vela-accent)]"
            />
          </SettingRow>
        )}
      </SettingSection>

      <SettingSection title="Navegador predeterminado">
        <SettingRow
          label="Usar Vela como navegador predeterminado"
          description="Los enlaces de otras aplicaciones se abrirán en Vela."
        >
          {isDefault ? (
            <span className="flex items-center gap-1.5 text-sm text-[var(--vela-accent)]">
              <CheckCircle2 className="h-4 w-4" />
              Predeterminado
            </span>
          ) : (
            <button
              onClick={() => void setAsDefault()}
              disabled={settingDefault || isDefault === null}
              className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-3 py-1 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {settingDefault ? 'Estableciendo…' : 'Establecer como predeterminado'}
            </button>
          )}
        </SettingRow>
      </SettingSection>

      <SettingSection title="Idioma">
        <SettingRow label="Idioma de la interfaz">
          <Select
            value="es"
            options={[{ value: 'es', label: 'Español' }]}
            onChange={() => undefined}
            disabled
          />
        </SettingRow>
      </SettingSection>

      <SettingSection title="Traducción">
        <SettingRow
          label="Idioma de destino"
          description="Idioma al que se traduce el texto seleccionado."
        >
          <Select<string>
            value={transSettings?.targetLang ?? 'es'}
            options={LANG_OPTIONS}
            onChange={(v) => void saveTransSetting({ targetLang: v })}
            disabled={transSettings === null}
          />
        </SettingRow>
        <SettingRow
          label="Detectar idioma automáticamente"
          description="Si está desactivado, puedes fijar el idioma de origen manualmente."
        >
          <Toggle
            value={(transSettings?.sourceMode ?? 'auto') === 'auto'}
            onChange={(v) => void saveTransSetting({ sourceMode: v ? 'auto' : 'manual' })}
          />
        </SettingRow>
        {transSettings !== null && transSettings.sourceMode !== 'auto' && (
          <SettingRow label="Idioma de origen">
            <Select<string>
              value={transSettings?.sourceLang ?? 'en'}
              options={LANG_OPTIONS}
              onChange={(v) => void saveTransSetting({ sourceLang: v })}
              disabled={transSettings === null}
            />
          </SettingRow>
        )}
      </SettingSection>

      <SettingSection title="Rendimiento">
        <SettingRow
          label="Uso de memoria de las pestañas"
          description="Muestra el consumo de RAM de cada pestaña en tiempo real."
        >
          <button
            onClick={() => void window.api.commands.execute('view.openResourcesMonitor')}
            className="flex items-center gap-1 rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-3 py-1 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50"
          >
            Abrir
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </SettingRow>
      </SettingSection>

      <SettingSection title="Actualizaciones">
        <SettingRow
          label="Comprobar actualizaciones automáticamente"
          description="Vela buscará nuevas versiones cada 4 horas."
        >
          <Toggle
            value={get<boolean>('updates:auto-check', true)}
            onChange={(v) => void set('updates:auto-check', v, 'global')}
          />
        </SettingRow>
        <SettingRow label={`Versión actual: ${__APP_VERSION__}`}>
          <button
            onClick={checkNow}
            className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-3 py-1 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50"
          >
            Buscar actualizaciones
          </button>
        </SettingRow>
      </SettingSection>
    </>
  );
}

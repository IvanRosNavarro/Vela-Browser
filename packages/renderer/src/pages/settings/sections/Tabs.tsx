import type { useSettings } from '../lib/useSettings';
import { SettingRow, SettingSection } from '../components/SettingRow';
import { Toggle } from '../components/controls/Toggle';
import { Select, type SelectOption } from '../components/controls/Select';
import { Slider } from '../components/controls/Slider';

type WorkspaceSwitchModifier = 'ctrl' | 'alt';

const WORKSPACE_MODIFIER_OPTIONS: SelectOption<WorkspaceSwitchModifier>[] = [
  { value: 'ctrl', label: 'Ctrl+dígito (Cmd+dígito en macOS)' },
  { value: 'alt',  label: 'Alt+dígito' },
];

type GlanceModifier = 'ctrl' | 'shift';

const GLANCE_MODIFIER_OPTIONS: SelectOption<GlanceModifier>[] = [
  { value: 'ctrl',  label: 'Ctrl+Click (Cmd+Click en macOS)' },
  { value: 'shift', label: 'Shift+Click' },
];

type PreviewResolution = 'low' | 'medium' | 'high';

const PREVIEW_RESOLUTION_OPTIONS: SelectOption<PreviewResolution>[] = [
  { value: 'low',    label: 'Baja  (~10 KB/pestaña)' },
  { value: 'medium', label: 'Media (~25 KB/pestaña)' },
  { value: 'high',   label: 'Alta  (~60 KB/pestaña)' },
];

const PREVIEW_KB: Record<PreviewResolution, number> = { low: 10, medium: 25, high: 60 };

type LastTabAction = 'new-tab' | 'empty';
type MruScope    = 'workspace' | 'global';
type MruBehavior = 'modal' | 'direct';
type NewTabPage  = 'blank' | 'newtab' | 'custom';

const LAST_TAB_OPTIONS: SelectOption<LastTabAction>[] = [
  { value: 'new-tab', label: 'Abrir nueva pestaña' },
  { value: 'empty',   label: 'Dejar workspace vacío' },
];

const MRU_SCOPE_OPTIONS: SelectOption<MruScope>[] = [
  { value: 'workspace', label: 'Solo este workspace' },
  { value: 'global',    label: 'Todos los workspaces' },
];

const MRU_BEHAVIOR_OPTIONS: SelectOption<MruBehavior>[] = [
  { value: 'modal',  label: 'Modal con previsualización' },
  { value: 'direct', label: 'Salto directo' },
];

type DiscardTimeout = '5' | '15' | '30' | '60' | '120' | '240';

const DISCARD_TIMEOUT_OPTIONS: SelectOption<DiscardTimeout>[] = [
  { value: '5',   label: '5 minutos' },
  { value: '15',  label: '15 minutos' },
  { value: '30',  label: '30 minutos' },
  { value: '60',  label: '1 hora' },
  { value: '120', label: '2 horas' },
  { value: '240', label: '4 horas' },
];

const NEW_TAB_PAGE_OPTIONS: SelectOption<NewTabPage>[] = [
  { value: 'newtab',  label: 'Página de Vela (vela://newtab)' },
  { value: 'blank',   label: 'Página en blanco (about:blank)' },
  { value: 'custom',  label: 'URL personalizada' },
];

interface Props {
  settings: ReturnType<typeof useSettings>;
}

export function Tabs({ settings }: Props) {
  const { get, set } = settings;

  const discardEnabled = get<boolean>('tabs:discard-enabled', true);
  const previewEnabled = get<boolean>('previews:enabled', true);
  const previewResolution = get<PreviewResolution>('previews:resolution', 'medium');
  const glanceEnabled = get<boolean>('glance:enabled', true);

  return (
    <>
      {/* ── Comportamiento general ── */}
      <SettingSection title="Comportamiento general">
        <SettingRow
          label="Restaurar pestañas al iniciar"
          description="Reabre las pestañas de la sesión anterior al arrancar Vela."
        >
          <Toggle
            value={get<boolean>('startup:restore-tabs', true)}
            onChange={(v) => void set('startup:restore-tabs', v)}
          />
        </SettingRow>
        <SettingRow
          label="Al cerrar la última pestaña del workspace"
        >
          <Select<LastTabAction>
            value={get<LastTabAction>('tabs:last-tab-action', 'new-tab')}
            options={LAST_TAB_OPTIONS}
            onChange={(v) => void set('tabs:last-tab-action', v)}
          />
        </SettingRow>
        <SettingRow
          label="Confirmar al cerrar ventana con varias pestañas"
          description="Muestra un diálogo de confirmación antes de cerrar."
        >
          <Toggle
            value={get<boolean>('tabs:confirm-close-window', false)}
            onChange={(v) => void set('tabs:confirm-close-window', v)}
          />
        </SettingRow>
        <SettingRow
          label="Activar nueva pestaña al crearla"
          description="Si está desactivado, la nueva pestaña se abre en background."
        >
          <Toggle
            value={get<boolean>('tabs:activate-new', true)}
            onChange={(v) => void set('tabs:activate-new', v)}
          />
        </SettingRow>
      </SettingSection>

      {/* ── Ctrl+Tab ── */}
      <SettingSection title="Ctrl+Tab">
        <SettingRow label="Alcance de Ctrl+Tab">
          <Select<MruScope>
            value={get<MruScope>('mru:scope', 'workspace')}
            options={MRU_SCOPE_OPTIONS}
            onChange={(v) => void set('mru:scope', v)}
          />
        </SettingRow>
        <SettingRow label="Modo de Ctrl+Tab">
          <Select<MruBehavior>
            value={get<MruBehavior>('mru:behavior', 'modal')}
            options={MRU_BEHAVIOR_OPTIONS}
            onChange={(v) => void set('mru:behavior', v)}
          />
        </SettingRow>
      </SettingSection>

      {/* ── Atajos de workspace ── */}
      <SettingSection title="Atajos de workspace">
        <SettingRow label="Atajo para cambiar de workspace (Ctrl/Alt+dígito)">
          <Select<WorkspaceSwitchModifier>
            value={get<WorkspaceSwitchModifier>('workspaces:switch-modifier', 'alt')}
            options={WORKSPACE_MODIFIER_OPTIONS}
            onChange={(v) => void set('workspaces:switch-modifier', v, 'global')}
          />
        </SettingRow>
      </SettingSection>

      {/* ── Previsualización de pestañas ── */}
      <SettingSection title="Previsualización de pestañas">
        <SettingRow
          label="Activar previsualización en Ctrl+Tab"
          description="Captura una imagen de cada pestaña para mostrarla en el selector."
        >
          <Toggle
            value={previewEnabled}
            onChange={(v) => void set('previews:enabled', v)}
          />
        </SettingRow>
        <SettingRow label="Resolución">
          <Select<PreviewResolution>
            value={previewResolution}
            options={PREVIEW_RESOLUTION_OPTIONS}
            onChange={(v) => void set('previews:resolution', v)}
            disabled={!previewEnabled}
          />
        </SettingRow>
        {previewEnabled && (
          <div className="px-4 py-2">
            <p className="text-xs text-[var(--vela-fg-muted)]">
              Las previsualizaciones ocupan aproximadamente{' '}
              <strong>{PREVIEW_KB[previewResolution]} KB</strong> por pestaña en disco.
            </p>
          </div>
        )}
      </SettingSection>

      {/* ── Auto-descartado ── */}
      <SettingSection title="Auto-descartado">
        <SettingRow
          label="Activar auto-descartado"
          description="Las pestañas inactivas se suspenden para liberar memoria."
        >
          <Toggle
            value={discardEnabled}
            onChange={(v) => void set('tabs:discard-enabled', v)}
          />
        </SettingRow>
        <SettingRow
          label="Descartar pestañas inactivas tras"
        >
          <Select<DiscardTimeout>
            value={String(get<number>('tabs:discard-timeout', 60)) as DiscardTimeout}
            options={DISCARD_TIMEOUT_OPTIONS}
            onChange={(v) => void set('tabs:discard-timeout', Number(v))}
          />
        </SettingRow>
        <SettingRow
          label="No descartar pestañas con audio o vídeo"
        >
          <Toggle
            value={get<boolean>('tabs:discard-audio', true)}
            onChange={(v) => void set('tabs:discard-audio', v)}
          />
        </SettingRow>
        <SettingRow
          label="No descartar pestañas con formularios sin enviar"
        >
          <Toggle
            value={get<boolean>('tabs:discard-forms', true)}
            onChange={(v) => void set('tabs:discard-forms', v)}
          />
        </SettingRow>
        <SettingRow
          label="No descartar Cargas ni Anclas"
        >
          <Toggle
            value={get<boolean>('tabs:discard-pinned', true)}
            onChange={(v) => void set('tabs:discard-pinned', v)}
          />
        </SettingRow>
        <div className="px-4 py-3">
          <label className="mb-1.5 block text-sm text-[var(--vela-fg)]">
            Dominios en lista blanca (uno por línea)
          </label>
          <textarea
            rows={4}
            value={get<string>('tabs:discard-whitelist', '')}
            onChange={(e) => void set('tabs:discard-whitelist', e.target.value)}
            disabled={!discardEnabled}
            placeholder={'ejemplo.com\ngmail.com'}
            className="w-full resize-y rounded border border-[var(--vela-border)] bg-[var(--vela-bg)] p-2.5 font-mono text-xs text-[var(--vela-fg)] placeholder:text-[var(--vela-fg-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--vela-accent)] disabled:opacity-40"
          />
          <p className="mt-1.5 text-xs text-[var(--vela-fg-muted)]">
            La gestión avanzada de lista blanca por workspace y carpeta estará
            disponible desde el menú contextual de las pestañas.
          </p>
        </div>
      </SettingSection>

      {/* ── Vista previa de enlaces (Glance) ── */}
      <SettingSection title="Vista previa de enlaces (Glance)">
        <SettingRow
          label="Activar Glance"
          description="Haz clic con el modificador configurado sobre un enlace para abrir una vista previa sin navegar."
        >
          <Toggle
            value={glanceEnabled}
            onChange={(v) => void set('glance:enabled', v)}
          />
        </SettingRow>
        <SettingRow label="Activar con">
          <Select<GlanceModifier>
            value={get<GlanceModifier>('glance:modifier', 'ctrl')}
            options={GLANCE_MODIFIER_OPTIONS}
            onChange={(v) => void set('glance:modifier', v)}
            disabled={!glanceEnabled}
          />
        </SettingRow>
        <SettingRow label="Ancho de ventana Glance">
          <Slider
            value={get<number>('glance:width', 640)}
            min={480}
            max={1920}
            step={10}
            onChange={(v) => void set('glance:width', v)}
          />
        </SettingRow>
        <SettingRow label="Alto de ventana Glance">
          <Slider
            value={get<number>('glance:height', 400)}
            min={300}
            max={1440}
            step={10}
            onChange={(v) => void set('glance:height', v)}
          />
        </SettingRow>
      </SettingSection>

      {/* ── Nueva pestaña ── */}
      <SettingSection title="Nueva pestaña">
        <SettingRow label="Al abrir una nueva pestaña, mostrar">
          <Select<NewTabPage>
            value={get<NewTabPage>('tabs:new-tab-page', 'newtab')}
            options={NEW_TAB_PAGE_OPTIONS}
            onChange={(v) => void set('tabs:new-tab-page', v)}
          />
        </SettingRow>
        {get<NewTabPage>('tabs:new-tab-page', 'newtab') === 'custom' && (
          <div className="px-4 py-2">
            <label className="mb-1.5 block text-sm text-[var(--vela-fg)]">
              URL personalizada
            </label>
            <input
              type="url"
              value={get<string>('tabs:new-tab-custom-url', '')}
              onChange={(e) => void set('tabs:new-tab-custom-url', e.target.value)}
              placeholder="https://ejemplo.com"
              className="w-full rounded border border-[var(--vela-border)] bg-[var(--vela-bg)] px-3 py-1.5 text-sm text-[var(--vela-fg)] placeholder:text-[var(--vela-fg-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--vela-accent)]"
            />
          </div>
        )}
      </SettingSection>

      {/* ── Grupos y árbol ── */}
      <SettingSection title="Grupos y árbol">
        <SettingRow
          label="Color heredado de carpetas"
          description="Las pestañas hijas adoptan el color de la carpeta padre."
        >
          <Toggle
            value={get<boolean>('ui:inheritedColorEnabled', true)}
            onChange={(v) => void set('ui:inheritedColorEnabled', v)}
          />
        </SettingRow>
        <SettingRow label="Líneas de indentación">
          <Toggle
            value={get<boolean>('ui:indentationGuides', true)}
            onChange={(v) => void set('ui:indentationGuides', v)}
          />
        </SettingRow>
        <SettingRow
          label="Colapsar carpetas al cambiar de workspace"
          description="Las carpetas desplegadas se cierran al activar otro workspace."
        >
          <Toggle
            value={get<boolean>('tabs:auto-collapse-folders', false)}
            onChange={(v) => void set('tabs:auto-collapse-folders', v)}
          />
        </SettingRow>
        <SettingRow
          label="Descartar pestañas al cambiar de workspace"
          description="Si está desactivado, las pestañas se mantienen en memoria y al volver al workspace se restauran sin recargar."
        >
          <Toggle
            value={get<boolean>('tabs:discard-on-workspace-switch', false)}
            onChange={(v) => void set('tabs:discard-on-workspace-switch', v)}
          />
        </SettingRow>
      </SettingSection>

      {/* ── Control multimedia ── */}
      <SettingSection title="Control multimedia">
        <SettingRow
          label="Widget de control multimedia"
          description="Muestra el botón ♩ en la barra de título cuando hay audio o vídeo reproduciéndose."
        >
          <Toggle
            value={get<boolean>('media:widget-enabled', true)}
            onChange={(v) => void set('media:widget-enabled', v, 'global')}
          />
        </SettingRow>
        <SettingRow
          label="Indicador en pestañas"
          description="Muestra un icono de nota musical junto a las pestañas que están reproduciendo audio."
        >
          <Toggle
            value={get<boolean>('media:tab-indicator', true)}
            onChange={(v) => void set('media:tab-indicator', v, 'global')}
          />
        </SettingRow>
      </SettingSection>
    </>
  );
}

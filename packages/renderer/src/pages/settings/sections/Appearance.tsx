import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Download, Pencil, Trash2, Upload } from 'lucide-react';
import { SettingRow, SettingSection } from '../components/SettingRow';
import { Toggle } from '../components/controls/Toggle';
import { Select, type SelectOption } from '../components/controls/Select';
import { Slider } from '../components/controls/Slider';
import { ThemePreviewCard } from '../components/ThemePreviewCard';
import { ThemeEditor } from '../components/ThemeEditor';
import { TitleBarConfigurator } from '../components/TitleBarConfigurator';
import { BUILTIN_THEMES, themeManager } from '../../../shared-ui/theme';
import { validateCustomCss } from '../../../shared-ui/theme/cssValidator';
import { useUiStore } from '../../../stores/uiStore';
import { customThemeExportSchema, type CustomThemeExport, type Theme } from '@vela/shared';
import type { useSettings } from '../lib/useSettings';

type FontFamily = 'system' | 'inter' | 'jetbrains-mono' | 'sf-pro' | 'custom';

const FONT_OPTIONS: SelectOption<FontFamily>[] = [
  { value: 'system', label: 'Sistema' },
  { value: 'inter', label: 'Inter' },
  { value: 'jetbrains-mono', label: 'JetBrains Mono' },
  { value: 'sf-pro', label: 'SF Pro' },
  { value: 'custom', label: 'Custom (CSS)' },
];

const MODE_LABELS = [
  { id: 'system', label: 'Sistema' },
  { id: 'light',  label: 'Claro' },
  { id: 'dark',   label: 'Oscuro' },
] as const;

type ThemeMode = 'system' | 'light' | 'dark';

function inferMode(themeId: string): ThemeMode {
  if (themeId === 'system') return 'system';
  const t = BUILTIN_THEMES.find((th) => th.id === themeId);
  if (!t) return 'system';
  return t.type;
}

interface Props {
  settings: ReturnType<typeof useSettings>;
}

// ─── Appearance ───────────────────────────────────────────────────────────────

export function Appearance({ settings }: Props) {
  const { get, set } = settings;
  const {
    theme: themeId,
    setTheme,
    inheritedColorEnabled,
    setInheritedColorEnabled,
    indentationGuides,
    setIndentationGuides,
    fontFamily,
    setFontFamily,
    fontSize,
    setFontSize,
    compactDensity,
    setCompactDensity,
    sidebarMode,
    setSidebarMode,
    customThemes,
    setCustomThemes,
    customCss,
    setCustomCss,
  } = useUiStore();

  const [creativosOpen, setCreativosOpen] = useState(true);

  // Sidebar width — se sincroniza con uiStore pero NO persiste en settings
  // (el arrastre manual también lo cambia; settings es solo para ajuste fino).
  const sidebarWidthNormal = useUiStore((s) => s.sidebarWidthNormal);
  const setSidebarWidthNormal = useUiStore((s) => s.setSidebarWidthNormal);

  // Glassmorphism — estado con carga diferida desde settings
  const [glassmorphismSupported, setGlassmorphismSupported] = useState(false);
  useEffect(() => {
    void window.api.runtime.getBackgroundMaterial().then((res) => {
      if (res.ok) setGlassmorphismSupported(res.data.supported);
    });
  }, []);

  const glassmorphism = get<boolean>('ui:glassmorphism', false);
  const glassmorphismIntensity = get<number>('ui:glassmorphism-intensity', 60);
  const glassmorphismOpacity = get<number>('ui:glassmorphism-opacity', 60);

  // Tema activo
  const activeMode: ThemeMode =
    themeId === 'system' ? 'system'
    : themeId === 'light' ? 'light'
    : themeId === 'dark'  ? 'dark'
    : inferMode(themeId);

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const modeFilter = (type: 'light' | 'dark') => {
    if (activeMode === 'system') return type === (prefersDark ? 'dark' : 'light');
    return type === activeMode;
  };

  const baseThemes = BUILTIN_THEMES.filter((t) => t.id === 'light' || t.id === 'dark');
  const creativeThemes = BUILTIN_THEMES.filter((t) => t.id !== 'light' && t.id !== 'dark');
  const visibleCreative = creativeThemes.filter((t) => modeFilter(t.type));
  const visibleBase = baseThemes.filter((t) => modeFilter(t.type));

  function handleModeClick(mode: ThemeMode) {
    if (mode === 'system') { void setTheme('system'); }
    else { void setTheme(mode); }
  }

  // ─── Temas custom ──────────────────────────────────────────────────────────

  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  const [baseForNew, setBaseForNew] = useState<string>('');
  const importRef = useRef<HTMLInputElement>(null);

  function handleCreateBased(baseId: string) {
    if (!baseId) return;
    const base = BUILTIN_THEMES.find((t) => t.id === baseId) ?? BUILTIN_THEMES[0]!;
    const draft: Theme = {
      ...base,
      id: crypto.randomUUID(),
      name: `${base.name} (custom)`,
      builtin: false,
    };
    setEditingTheme(draft);
  }

  async function handleSaveEdit(theme: Theme) {
    const next = customThemes.some((t) => t.id === theme.id)
      ? customThemes.map((t) => (t.id === theme.id ? theme : t))
      : [...customThemes, theme];
    await setCustomThemes(next);
    setEditingTheme(null);
    // Aplicar si es el tema activo
    if (themeId === theme.id) void setTheme(theme.id);
  }

  function handleDeleteTheme(id: string) {
    const next = customThemes.filter((t) => t.id !== id);
    void setCustomThemes(next);
    if (themeId === id) void setTheme('system');
  }

  function handleDuplicateTheme(theme: Theme) {
    const copy: Theme = { ...theme, id: crypto.randomUUID(), name: `${theme.name} (copia)` };
    void setCustomThemes([...customThemes, copy]);
  }

  async function handleExportTheme(theme: Theme) {
    const payload: CustomThemeExport = {
      format: 'vela-theme',
      version: 1,
      id: theme.id,
      name: theme.name,
      type: theme.type,
      variables: theme.variables,
    };
    await window.api.theme.exportFile({ theme: payload, name: theme.name });
  }

  function handleImportClick() {
    importRef.current?.click();
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string);
        const parsed = customThemeExportSchema.safeParse(raw);
        if (!parsed.success) {
          alert('Archivo de tema inválido o corrupto.');
          return;
        }
        const imported: Theme = {
          id: parsed.data.id,
          name: parsed.data.name,
          type: parsed.data.type,
          builtin: false,
          variables: parsed.data.variables,
        };
        // Evitar duplicados por ID
        const already = customThemes.some((t) => t.id === imported.id);
        const next = already
          ? customThemes.map((t) => (t.id === imported.id ? imported : t))
          : [...customThemes, imported];
        void setCustomThemes(next);
      } catch {
        alert('No se pudo leer el archivo de tema.');
      }
    };
    reader.readAsText(file);
    // Limpiar para permitir reimportar el mismo archivo
    e.target.value = '';
  }

  // ─── CSS personalizado ─────────────────────────────────────────────────────

  const [cssInput, setCssInput] = useState(customCss);
  const [cssError, setCssError] = useState('');

  function handleApplyCss() {
    const { valid, invalidUrls } = validateCustomCss(cssInput);
    if (!valid) {
      setCssError(
        `CSS rechazado: contiene URLs externas no permitidas:\n${invalidUrls.join('\n')}\nSolo se permite url(data:…) y url(vela:…).`,
      );
      return;
    }
    setCssError('');
    void setCustomCss(cssInput);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Tema ── */}
      <SettingSection title="Tema">
        <div className="flex gap-2 px-4 py-3">
          {MODE_LABELS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => handleModeClick(id as ThemeMode)}
              className={[
                'rounded-md px-4 py-1.5 text-sm transition-colors',
                activeMode === id
                  ? 'bg-[var(--vela-accent)] text-[var(--vela-accent-fg)]'
                  : 'border border-[var(--vela-border)] text-[var(--vela-fg-muted)] hover:border-[var(--vela-accent)] hover:text-[var(--vela-fg)]',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {visibleBase.length > 0 && (
          <div className="flex flex-wrap gap-3 px-4 pb-3">
            {visibleBase.map((t) => (
              <ThemePreviewCard
                key={t.id}
                theme={t}
                selected={
                  themeId === t.id ||
                  (themeId === 'system' && t.id === (prefersDark ? 'dark' : 'light'))
                }
                onClick={() => void setTheme(t.id)}
              />
            ))}
          </div>
        )}

        <div className="border-t border-[var(--vela-border)]">
          <button
            onClick={() => setCreativosOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)]"
          >
            {creativosOpen
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
            Temas creativos
          </button>
          {creativosOpen && (
            <div className="flex flex-wrap gap-3 px-4 pb-4">
              {(activeMode === 'system' ? creativeThemes : visibleCreative).map((t) => (
                <ThemePreviewCard
                  key={t.id}
                  theme={t}
                  selected={themeId === t.id}
                  onClick={() => void setTheme(t.id)}
                />
              ))}
            </div>
          )}
        </div>
      </SettingSection>

      {/* ── Temas personalizados ── */}
      <SettingSection title="Temas personalizados">
        {/* Lista de temas custom */}
        {customThemes.length > 0 && (
          <div className="divide-y divide-[var(--vela-border)]">
            {customThemes.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <div
                    className="h-8 w-8 shrink-0 rounded border border-[var(--vela-border)]"
                    style={{ background: t.variables['--vela-bg'] ?? '#111' }}
                  />
                  <div>
                    <p className="text-sm text-[var(--vela-fg)]">{t.name}</p>
                    <p className="text-xs text-[var(--vela-fg-muted)]">
                      {t.type === 'dark' ? 'Oscuro' : 'Claro'}
                      {themeId === t.id && ' · activo'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    title="Editar"
                    onClick={() => setEditingTheme(t)}
                    className="rounded p-1.5 text-[var(--vela-fg-muted)] hover:bg-[var(--vela-sidebar-hover-bg)] hover:text-[var(--vela-fg)]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    title="Duplicar"
                    onClick={() => handleDuplicateTheme(t)}
                    className="rounded p-1.5 text-[var(--vela-fg-muted)] hover:bg-[var(--vela-sidebar-hover-bg)] hover:text-[var(--vela-fg)]"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    title="Exportar"
                    onClick={() => void handleExportTheme(t)}
                    className="rounded p-1.5 text-[var(--vela-fg-muted)] hover:bg-[var(--vela-sidebar-hover-bg)] hover:text-[var(--vela-fg)]"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    title="Aplicar"
                    onClick={() => void setTheme(t.id)}
                    className={[
                      'rounded px-2 py-1 text-xs transition-colors',
                      themeId === t.id
                        ? 'bg-[var(--vela-accent)] text-[var(--vela-accent-fg)]'
                        : 'border border-[var(--vela-border)] text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)]',
                    ].join(' ')}
                  >
                    {themeId === t.id ? 'Activo' : 'Aplicar'}
                  </button>
                  <button
                    title="Eliminar"
                    onClick={() => handleDeleteTheme(t.id)}
                    className="rounded p-1.5 text-[var(--vela-fg-muted)] hover:bg-[var(--vela-sidebar-hover-bg)] hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          {/* Crear basado en builtin */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-[var(--vela-fg-muted)]">Crear basado en:</span>
            <select
              value={baseForNew}
              onChange={(e) => setBaseForNew(e.target.value)}
              className="rounded border border-[var(--vela-border)] bg-[var(--vela-bg)] px-2 py-1 text-xs text-[var(--vela-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--vela-accent)]"
            >
              <option value="">— elegir —</option>
              {BUILTIN_THEMES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              disabled={!baseForNew}
              onClick={() => { handleCreateBased(baseForNew); setBaseForNew(''); }}
              className="rounded bg-[var(--vela-accent)] px-3 py-1 text-xs text-[var(--vela-accent-fg)] disabled:opacity-40 hover:opacity-90"
            >
              Crear
            </button>
          </div>

          {/* Importar */}
          <button
            onClick={handleImportClick}
            className="flex items-center gap-1.5 rounded border border-[var(--vela-border)] px-3 py-1 text-xs text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)]"
          >
            <Upload className="h-3.5 w-3.5" />
            Importar tema
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json,.vela-theme"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
      </SettingSection>

      {/* ── Sidebar ── */}
      <SettingSection title="Sidebar">
        <SettingRow label="Modo compacto" description="Sidebar de ancho reducido con solo íconos.">
          <Toggle
            value={sidebarMode === 'compact'}
            onChange={(v) => void setSidebarMode(v ? 'compact' : 'normal')}
          />
        </SettingRow>
        <SettingRow
          label="Color heredado de carpetas"
          description="Las pestañas hijas adoptan el color de la carpeta padre."
        >
          <Toggle
            value={inheritedColorEnabled}
            onChange={(v) => void setInheritedColorEnabled(v)}
          />
        </SettingRow>
        <SettingRow label="Líneas de indentación">
          <Toggle
            value={indentationGuides}
            onChange={(v) => void setIndentationGuides(v)}
          />
        </SettingRow>
        <SettingRow
          label="Ancho en modo normal"
          description={`${sidebarWidthNormal} px`}
        >
          <Slider
            value={sidebarWidthNormal}
            min={180}
            max={400}
            step={4}
            onChange={(v) => setSidebarWidthNormal(v)}
          />
        </SettingRow>
      </SettingSection>

      {/* ── Efectos ── */}
      <SettingSection title="Efectos">
        <SettingRow
          label="Glassmorphism en sidebar"
          description={
            glassmorphismSupported
              ? 'Efecto de cristal con desenfoque nativo del sistema operativo.'
              : 'Efecto de cristal con desenfoque CSS sobre el fondo de la ventana.'
          }
        >
          <Toggle
            value={glassmorphism}
            onChange={(v) => {
              themeManager.applyGlassmorphism(v, glassmorphismIntensity, glassmorphismOpacity);
              void set('ui:glassmorphism', v);
            }}
          />
        </SettingRow>
        {glassmorphism && (
          <>
            <SettingRow label="Blur" description="Intensidad del desenfoque">
              <Slider
                value={glassmorphismIntensity}
                min={0}
                max={100}
                step={5}
                onChange={(v) => {
                  themeManager.applyGlassmorphism(glassmorphism, v, glassmorphismOpacity);
                  void set('ui:glassmorphism-intensity', v);
                }}
              />
            </SettingRow>
            <SettingRow label="Opacidad" description="Menor opacidad = más transparencia del cristal">
              <Slider
                value={glassmorphismOpacity}
                min={0}
                max={100}
                step={5}
                onChange={(v) => {
                  themeManager.applyGlassmorphism(glassmorphism, glassmorphismIntensity, v);
                  void set('ui:glassmorphism-opacity', v);
                }}
              />
            </SettingRow>
          </>
        )}
        <div className="px-4 py-2">
          <p className="text-xs text-[var(--vela-fg-muted)]">
            {glassmorphismSupported
              ? 'Material nativo activo — el efecto difumina el contenido del sistema operativo.'
              : 'El desenfoque nativo requiere Windows 11 22H2+ o macOS 10.14+.'}
          </p>
        </div>
      </SettingSection>

      {/* ── Tipografía ── */}
      <SettingSection title="Tipografía">
        <SettingRow label="Familia de fuente">
          <Select<FontFamily>
            value={(fontFamily as FontFamily) || 'system'}
            options={FONT_OPTIONS}
            onChange={(v) => void setFontFamily(v)}
          />
        </SettingRow>
        <SettingRow label="Tamaño de fuente base">
          <Slider
            value={fontSize}
            min={12}
            max={18}
            onChange={(v) => void setFontSize(v)}
          />
        </SettingRow>
      </SettingSection>

      {/* ── Densidad ── */}
      <SettingSection title="Densidad">
        <SettingRow
          label="Densidad compacta"
          description="Reduce los márgenes internos de pestañas y filas."
        >
          <Toggle
            value={compactDensity}
            onChange={(v) => void setCompactDensity(v)}
          />
        </SettingRow>
      </SettingSection>

      {/* ── Barra de título ── */}
      <SettingSection title="Barra de título">
        <div className="px-4 py-3">
          <p className="mb-3 text-xs text-[var(--vela-fg-muted)]">
            Elige qué iconos se muestran en la barra de título. Los cambios se aplican en tiempo real.
          </p>
          <TitleBarConfigurator />
        </div>
      </SettingSection>

      {/* ── CSS personalizado ── */}
      <SettingSection title="CSS personalizado">
        <div className="px-4 py-3">
          <p className="mb-2 text-xs text-[var(--vela-fg-muted)]">
            Este CSS se inyecta en todas las páginas internas de Vela.
            Selectores disponibles: <code className="font-mono">.vela-sidebar</code>,{' '}
            <code className="font-mono">.vela-tab</code>, etc. Usar con precaución.
            <br />
            <strong>Nota de seguridad:</strong> Se bloquean las URL externas en <code className="font-mono">url()</code>.
            Solo se permiten <code className="font-mono">url(data:…)</code> y <code className="font-mono">url(vela:…)</code>.
          </p>
          <textarea
            value={cssInput}
            onChange={(e) => setCssInput(e.target.value)}
            spellCheck={false}
            rows={8}
            className="w-full resize-y rounded border border-[var(--vela-border)] bg-[var(--vela-bg)] p-3 font-mono text-xs text-[var(--vela-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--vela-accent)]"
            placeholder="/* Escribe tu CSS aquí */&#10;.vela-tab { font-style: italic; }"
          />
          {cssError && (
            <p className="mt-2 whitespace-pre-wrap text-xs text-[var(--vela-danger)]">{cssError}</p>
          )}
          <div className="mt-2 flex justify-end">
            <button
              onClick={handleApplyCss}
              className="rounded bg-[var(--vela-accent)] px-4 py-1.5 text-xs text-[var(--vela-accent-fg)] hover:opacity-90"
            >
              Aplicar
            </button>
          </div>
        </div>
      </SettingSection>

      {/* ── Modal ThemeEditor ── */}
      {editingTheme !== null && (
        <ThemeEditor
          theme={editingTheme}
          onSave={(saved) => void handleSaveEdit(saved)}
          onCancel={() => setEditingTheme(null)}
        />
      )}
    </>
  );
}

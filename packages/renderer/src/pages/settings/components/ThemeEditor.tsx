import { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import type { Theme } from '@vela/shared';
import { ColorInput } from './controls/ColorInput';
import { ThemePreviewCard } from './ThemePreviewCard';

// ─── Definición de variables editables por categoría ─────────────────────────

interface VarDef {
  key: string;
  label: string;
}

const EDITOR_CATEGORIES = [
  {
    id: 'base',
    label: 'Base',
    vars: [
      { key: '--vela-bg', label: 'Fondo base' },
      { key: '--vela-bg-elevated', label: 'Fondo elevado' },
      { key: '--vela-fg', label: 'Texto principal' },
      { key: '--vela-fg-muted', label: 'Texto atenuado' },
      { key: '--vela-border', label: 'Borde' },
      { key: '--vela-accent', label: 'Color acento' },
      { key: '--vela-accent-fg', label: 'Texto sobre acento' },
      { key: '--vela-success', label: 'Éxito' },
      { key: '--vela-warning', label: 'Advertencia' },
      { key: '--vela-danger', label: 'Error' },
    ] satisfies VarDef[],
  },
  {
    id: 'sidebar',
    label: 'Sidebar',
    vars: [
      { key: '--vela-sidebar-bg', label: 'Fondo' },
      { key: '--vela-sidebar-fg', label: 'Texto' },
      { key: '--vela-sidebar-active-bg', label: 'Item activo' },
      { key: '--vela-sidebar-hover-bg', label: 'Item hover' },
    ] satisfies VarDef[],
  },
  {
    id: 'titlebar',
    label: 'Título',
    vars: [
      { key: '--vela-titlebar-bg', label: 'Fondo' },
      { key: '--vela-titlebar-fg', label: 'Texto' },
      { key: '--vela-titlebar-button-hover', label: 'Botón hover' },
    ] satisfies VarDef[],
  },
  {
    id: 'urlbar',
    label: 'URL bar',
    vars: [
      { key: '--vela-addressbar-bg', label: 'Fondo' },
      { key: '--vela-addressbar-border', label: 'Borde' },
      { key: '--vela-addressbar-fg', label: 'Texto' },
      { key: '--vela-addressbar-fg-muted', label: 'Texto atenuado' },
      { key: '--vela-suggestion-bg', label: 'Sugerencias fondo' },
      { key: '--vela-suggestion-bg-active', label: 'Sugerencia activa' },
    ] satisfies VarDef[],
  },
  {
    id: 'tabs',
    label: 'Pestañas',
    vars: [
      { key: '--vela-tab-active-bg', label: 'Pestaña activa fondo' },
      { key: '--vela-tab-active-fg', label: 'Pestaña activa texto' },
    ] satisfies VarDef[],
  },
  {
    id: 'typography',
    label: 'Tipografía',
    vars: [
      { key: '--vela-font-size', label: 'Tamaño de fuente' },
      { key: '--vela-radius-sm', label: 'Radio pequeño' },
      { key: '--vela-radius-md', label: 'Radio medio' },
      { key: '--vela-radius-lg', label: 'Radio grande' },
    ] satisfies VarDef[],
  },
] as const;

// ─── Input de variable ────────────────────────────────────────────────────────

function isHex(v: string): boolean {
  return /^#[0-9a-fA-F]{3,8}$/.test(v.trim());
}

function looksLikeColor(v: string): boolean {
  return /^(rgba?|hsla?|oklch)\(/.test(v.trim());
}

function VarInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  if (isHex(value)) {
    return <ColorInput value={value} onChange={onChange} />;
  }
  return (
    <div className="flex items-center gap-2">
      {looksLikeColor(value) && (
        <div
          className="h-6 w-6 shrink-0 rounded border border-[var(--vela-border)]"
          style={{ background: value }}
        />
      )}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-48 rounded border border-[var(--vela-border)] bg-[var(--vela-bg)] px-2 py-1 font-mono text-xs text-[var(--vela-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--vela-accent)]"
        spellCheck={false}
      />
    </div>
  );
}

// ─── Derivación de variables compat ──────────────────────────────────────────

/**
 * A partir de las variables principales editadas por el usuario, recalcula los
 * alias de compatibilidad hacia atrás para que todos los componentes funcionen.
 */
function buildFullVars(vars: Record<string, string>): Record<string, string> {
  const v = vars;
  const bg = v['--vela-bg'] ?? '';
  const bgEl = v['--vela-bg-elevated'] ?? '';
  const fgMuted = v['--vela-fg-muted'] ?? '';
  const accent = v['--vela-accent'] ?? '';
  const success = v['--vela-success'] ?? '';
  const danger = v['--vela-danger'] ?? '';
  const sidebarBg = v['--vela-sidebar-bg'] ?? '';
  const sidebarHover = v['--vela-sidebar-hover-bg'] ?? '';
  const sidebarActive = v['--vela-sidebar-active-bg'] ?? '';
  const tbHover = v['--vela-titlebar-button-hover'] ?? '';
  return {
    ...vars,
    '--vela-bg-app': bg,
    '--vela-bg-sidebar': sidebarBg,
    '--vela-bg-sidebar-elev': bgEl,
    '--vela-bg-surface': bgEl,
    '--vela-bg-row-hover': sidebarHover,
    '--vela-bg-row-active': sidebarActive,
    '--vela-bg-folder-hover': sidebarHover,
    '--vela-fg-subtle': fgMuted,
    '--vela-border-strong': v['--vela-border'] ?? '',
    '--vela-accent-soft': sidebarActive,
    '--vela-accent-strong': accent,
    '--vela-folder-marker-default': bgEl,
    '--vela-drop-line': accent,
    '--vela-drop-bg': sidebarActive,
    '--vela-indent-guide': v['--vela-border'] ?? '',
    '--vela-inherit-line-alpha': v['--vela-inherit-line-alpha'] ?? '0.5',
    '--vela-row-h-normal': v['--vela-row-h-normal'] ?? '32px',
    '--vela-row-h-compact': v['--vela-row-h-compact'] ?? '40px',
    '--vela-indent-normal': v['--vela-indent-normal'] ?? '14px',
    '--vela-indent-compact': v['--vela-indent-compact'] ?? '8px',
    '--vela-sidebar-w-normal': v['--vela-sidebar-w-normal'] ?? '240px',
    '--vela-sidebar-w-compact': v['--vela-sidebar-w-compact'] ?? '56px',
    '--vela-titlebar-fg-muted': fgMuted,
    '--vela-titlebar-accent': accent,
    '--vela-titlebar-button-hover-bg': tbHover,
    '--vela-titlebar-button-active-bg': tbHover,
    '--vela-secure': success,
    '--vela-insecure': danger,
    '--sidebar-backdrop-filter': v['--sidebar-backdrop-filter'] ?? 'none',
    '--sidebar-background-opacity': v['--sidebar-background-opacity'] ?? '1',
    '--sidebar-background-color': sidebarBg,
    '--vela-tab-discarded-opacity': v['--vela-tab-discarded-opacity'] ?? '0.5',
    '--vela-folder-marker-w': v['--vela-folder-marker-w'] ?? '3px',
  };
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  theme: Theme;
  onSave: (theme: Theme) => void;
  onCancel: () => void;
}

export function ThemeEditor({ theme, onSave, onCancel }: Props) {
  const [name, setName] = useState(theme.name);
  const [type, setType] = useState<'light' | 'dark'>(theme.type);
  const [vars, setVars] = useState<Record<string, string>>({ ...theme.variables });
  const [activeTab, setActiveTab] = useState('base');

  const setVar = useCallback((key: string, value: string) => {
    setVars((prev) => ({ ...prev, [key]: value }));
  }, []);

  const activeCategory = EDITOR_CATEGORIES.find((c) => c.id === activeTab) ?? EDITOR_CATEGORIES[0];

  const previewTheme: Theme = { ...theme, name, type, variables: vars };

  function handleSave() {
    const finalName = name.trim() || theme.name;
    onSave({ ...theme, name: finalName, type, variables: buildFullVars(vars) });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="flex w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-[var(--vela-border)] shadow-2xl"
        style={{ maxHeight: '90vh', background: 'var(--vela-bg-elevated)' }}
      >
        {/* ── Cabecera ── */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--vela-border)] px-6 py-4">
          <h2 className="text-sm font-semibold text-[var(--vela-fg)]">
            Editar tema
          </h2>
          <button
            onClick={onCancel}
            className="rounded p-1 text-[var(--vela-fg-muted)] hover:bg-[var(--vela-sidebar-hover-bg)] hover:text-[var(--vela-fg)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Cuerpo ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Columna izquierda: formulario */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Nombre y tipo */}
            <div className="shrink-0 space-y-3 border-b border-[var(--vela-border)] px-6 py-4">
              <div className="flex items-center gap-3">
                <label className="w-16 shrink-0 text-xs text-[var(--vela-fg-muted)]">Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 rounded border border-[var(--vela-border)] bg-[var(--vela-bg)] px-3 py-1.5 text-sm text-[var(--vela-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--vela-accent)]"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-xs text-[var(--vela-fg-muted)]">Tipo</span>
                <div className="flex gap-2">
                  {(['light', 'dark'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={[
                        'rounded px-3 py-1 text-xs transition-colors',
                        type === t
                          ? 'bg-[var(--vela-accent)] text-[var(--vela-accent-fg)]'
                          : 'border border-[var(--vela-border)] text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)]',
                      ].join(' ')}
                    >
                      {t === 'light' ? 'Claro' : 'Oscuro'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Pestañas de categoría */}
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--vela-border)] px-6 py-2">
              {EDITOR_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveTab(cat.id)}
                  className={[
                    'shrink-0 rounded px-3 py-1 text-xs transition-colors',
                    activeTab === cat.id
                      ? 'bg-[var(--vela-sidebar-active-bg)] text-[var(--vela-fg)]'
                      : 'text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)]',
                  ].join(' ')}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Lista de variables */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-3">
                {activeCategory?.vars.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-4">
                    <span className="w-36 shrink-0 text-xs text-[var(--vela-fg)]">{label}</span>
                    <VarInput
                      value={vars[key] ?? ''}
                      onChange={(v) => setVar(key, v)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Columna derecha: preview */}
          <div className="flex w-52 shrink-0 flex-col items-center gap-3 border-l border-[var(--vela-border)] p-6">
            <p className="self-start text-xs text-[var(--vela-fg-muted)]">Vista previa</p>
            <ThemePreviewCard theme={previewTheme} selected={false} onClick={() => {}} />
          </div>
        </div>

        {/* ── Pie ── */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--vela-border)] px-6 py-4">
          <button
            onClick={onCancel}
            className="rounded px-4 py-2 text-sm text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)]"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="rounded bg-[var(--vela-accent)] px-4 py-2 text-sm text-[var(--vela-accent-fg)] hover:opacity-90"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Search, Upload, RotateCcw, Keyboard } from 'lucide-react';
import type { CommandCategory, ShortcutCommandInfo } from '@vela/shared';
import { ShortcutCaptureModal } from '../components/ShortcutCaptureModal';
import { GestureSettings } from './GestureSettings';

// Grupos de categorías para la UI
type DisplayGroup =
  | 'Navegación'
  | 'Pestañas'
  | 'Workspaces'
  | 'Carpetas'
  | 'Vista'
  | 'Perfil'
  | 'Herramientas';

const CATEGORY_TO_GROUP: Record<CommandCategory, DisplayGroup> = {
  navigation: 'Navegación',
  tab: 'Pestañas',
  workspace: 'Workspaces',
  folder: 'Carpetas',
  view: 'Vista',
  window: 'Vista',
  profile: 'Perfil',
  internal: 'Herramientas',
  reader: 'Herramientas',
  screenshot: 'Herramientas',
  devtools: 'Herramientas',
};

const GROUP_ORDER: DisplayGroup[] = [
  'Navegación', 'Pestañas', 'Workspaces', 'Carpetas', 'Vista', 'Perfil', 'Herramientas',
];

/** Atajo efectivo de un comando: custom si existe, default si no, undefined si null (sin atajo). */
function effectiveShortcut(cmd: ShortcutCommandInfo): string | undefined {
  if (cmd.customShortcut === null) return undefined;          // usuario lo quitó
  if (cmd.customShortcut !== undefined) return cmd.customShortcut; // override
  return cmd.defaultShortcut;                                  // default
}

/** Etiqueta visual del atajo con info de si es custom o default. */
function ShortcutBadge({ cmd }: { cmd: ShortcutCommandInfo }) {
  const eff = effectiveShortcut(cmd);
  if (!eff) {
    return <span className="text-sm text-[var(--vela-fg-muted)]">—</span>;
  }
  const isCustom = cmd.customShortcut !== undefined && cmd.customShortcut !== null;
  return (
    <kbd
      className={[
        'rounded px-1.5 py-0.5 font-mono text-xs',
        isCustom
          ? 'border border-[var(--vela-accent)] bg-[var(--vela-accent)]/10 text-[var(--vela-accent)]'
          : 'border border-[var(--vela-border)] bg-[var(--vela-bg-subtle)] text-[var(--vela-fg-muted)]',
      ].join(' ')}
    >
      {eff}
    </kbd>
  );
}

export function Shortcuts() {
  const [commands, setCommands] = useState<ShortcutCommandInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ShortcutCommandInfo | null>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [wsModifier, setWsModifier] = useState<'ctrl' | 'alt'>('alt');

  const load = useCallback(async () => {
    const [shortcutsRes, modifierRes] = await Promise.all([
      window.api.shortcuts.getAll(),
      window.api.settings.get({ key: 'workspaces:switch-modifier' }),
    ]);
    if (shortcutsRes.ok) setCommands(shortcutsRes.data);
    if (modifierRes.ok && (modifierRes.data.value === 'ctrl' || modifierRes.data.value === 'alt')) {
      setWsModifier(modifierRes.data.value);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return commands;
    const q = search.trim().toLowerCase();
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        (effectiveShortcut(c) ?? '').toLowerCase().includes(q),
    );
  }, [commands, search]);

  const grouped = useMemo(() => {
    const map = new Map<DisplayGroup, ShortcutCommandInfo[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const cmd of filtered) {
      const group = CATEGORY_TO_GROUP[cmd.category];
      map.get(group)?.push(cmd);
    }
    return map;
  }, [filtered]);

  // Lista de atajos efectivos para el modal (detección de conflictos)
  const allEffective = useMemo(
    () =>
      commands.map((c) => ({
        id: c.id,
        title: c.title,
        effectiveShortcut: effectiveShortcut(c),
      })),
    [commands],
  );

  const handleSave = useCallback(
    async (shortcut: string) => {
      if (!editing) return;
      // Si hay otro comando con ese atajo, primero lo liberamos (null)
      const conflict = commands.find(
        (c) => c.id !== editing.id && effectiveShortcut(c) === shortcut,
      );
      if (conflict) {
        await window.api.shortcuts.set({ commandId: conflict.id, shortcut: null });
      }
      await window.api.shortcuts.set({ commandId: editing.id, shortcut });
      setEditing(null);
      await load();
    },
    [editing, commands, load],
  );

  const handleRemove = useCallback(async () => {
    if (!editing) return;
    await window.api.shortcuts.set({ commandId: editing.id, shortcut: null });
    setEditing(null);
    await load();
  }, [editing, load]);

  const handleResetOne = useCallback(
    async (cmd: ShortcutCommandInfo) => {
      await window.api.shortcuts.resetOne({ commandId: cmd.id });
      await load();
    },
    [load],
  );

  const handleResetAll = useCallback(async () => {
    await window.api.shortcuts.resetAll();
    setResetConfirm(false);
    await load();
  }, [load]);

  const handleExport = useCallback(async () => {
    await window.api.shortcuts.export();
  }, []);

  const handleImport = useCallback(async () => {
    const res = await window.api.shortcuts.import();
    if (!res.ok) {
      setImportMsg(`Error al importar: ${String(res.error)}`);
      return;
    }
    const { imported, conflicts } = res.data;
    if (conflicts.length > 0) {
      setImportMsg(
        `Importados ${imported} atajos. Omitidos por conflicto interno: ${conflicts.join(', ')}.`,
      );
    } else {
      setImportMsg(`Importados ${imported} atajos correctamente.`);
    }
    await load();
    setTimeout(() => setImportMsg(null), 5000);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-[var(--vela-fg-muted)]">Cargando atajos…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabecera con buscador y acciones */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--vela-fg-muted)]"
          />
          <input
            type="text"
            placeholder="Buscar comando…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-input)] py-1.5 pl-8 pr-3 text-sm text-[var(--vela-fg)] placeholder:text-[var(--vela-fg-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--vela-accent)]"
          />
        </div>
        <button
          onClick={() => void handleExport()}
          title="Exportar atajos"
          className="flex items-center gap-1.5 rounded-lg border border-[var(--vela-border)] px-3 py-1.5 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-bg-hover)]"
        >
          <Download size={14} />
          Exportar
        </button>
        <button
          onClick={() => void handleImport()}
          title="Importar atajos"
          className="flex items-center gap-1.5 rounded-lg border border-[var(--vela-border)] px-3 py-1.5 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-bg-hover)]"
        >
          <Upload size={14} />
          Importar
        </button>
      </div>

      {importMsg && (
        <div className="rounded-lg border border-[var(--vela-accent)] bg-[var(--vela-accent)]/10 px-4 py-2 text-sm text-[var(--vela-fg)]">
          {importMsg}
        </div>
      )}

      {/* Grupos de comandos */}
      {GROUP_ORDER.map((group) => {
        const cmds = grouped.get(group) ?? [];
        if (cmds.length === 0) return null;
        return (
          <section key={group}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--vela-fg-muted)]">
              {group}
            </h2>
            <div className="divide-y divide-[var(--vela-border)] overflow-hidden rounded-lg border border-[var(--vela-border)]">
              {cmds.map((cmd) => (
                <div
                  key={cmd.id}
                  className="flex items-center gap-3 bg-[var(--vela-bg-card)] px-4 py-3 hover:bg-[var(--vela-bg-hover)]"
                >
                  <span className="flex-1 text-sm text-[var(--vela-fg)]">{cmd.title}</span>
                  <div className="w-36 text-right">
                    <ShortcutBadge cmd={cmd} />
                  </div>
                  {cmd.customShortcut !== undefined && (
                    <button
                      onClick={() => void handleResetOne(cmd)}
                      title="Restaurar atajo por defecto"
                      className="rounded-md p-1 text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-hover)] hover:text-[var(--vela-fg)]"
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => setEditing(cmd)}
                    className="rounded-md border border-[var(--vela-border)] px-2.5 py-1 text-xs text-[var(--vela-fg)] hover:bg-[var(--vela-bg-hover)]"
                  >
                    Editar
                  </button>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Keyboard className="h-8 w-8 text-[var(--vela-fg-muted)]" strokeWidth={1.5} />
          <p className="text-sm text-[var(--vela-fg-muted)]">
            No se encontraron comandos para "{search}".
          </p>
        </div>
      )}

      {/* Footer: restaurar todos */}
      <div className="flex items-center justify-between border-t border-[var(--vela-border)] pt-4">
        {!resetConfirm ? (
          <button
            onClick={() => setResetConfirm(true)}
            className="flex items-center gap-1.5 text-sm text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)]"
          >
            <RotateCcw size={14} />
            Restaurar todos los atajos
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <p className="text-sm text-[var(--vela-fg)]">
              ¿Restaurar todos los atajos a sus valores por defecto?
            </p>
            <button
              onClick={() => void handleResetAll()}
              className="rounded-lg bg-[var(--vela-error,#ef4444)] px-3 py-1 text-sm font-medium text-white hover:opacity-90"
            >
              Restaurar
            </button>
            <button
              onClick={() => setResetConfirm(false)}
              className="rounded-lg border border-[var(--vela-border)] px-3 py-1 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-bg-hover)]"
            >
              Cancelar
            </button>
          </div>
        )}
        <p className="text-xs text-[var(--vela-fg-muted)]">
          <span className="text-[var(--vela-accent)]">■</span> Personalizado
          {' · '}
          <span className="opacity-50">■</span> Por defecto
        </p>
      </div>

      {/* Modal de captura */}
      {editing && (
        <ShortcutCaptureModal
          commandTitle={editing.title}
          currentShortcut={effectiveShortcut(editing)}
          allShortcuts={allEffective.filter((s) => s.id !== editing.id)}
          workspaceSwitchModifier={wsModifier}
          onSave={(combo) => void handleSave(combo)}
          onRemove={() => void handleRemove()}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Separador */}
      <div className="border-t border-[var(--vela-border)] pt-6">
        <GestureSettings />
      </div>
    </div>
  );
}

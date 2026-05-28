import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  AutoGroupRule,
  AutoGroupRuleMatchType,
  TreeNode,
} from '@vela/shared';
import { call } from '../../lib/ipc';
import {
  useRulesStore,
  useTreeStore,
  useWorkspacesStore,
} from '../../stores';

interface FolderOption {
  id: string;
  label: string; // ruta jerárquica con indentación
}

function buildFolderOptions(nodes: readonly TreeNode[]): FolderOption[] {
  const byId = new Map<string, TreeNode>();
  for (const n of nodes) byId.set(n.id, n);

  function pathOf(id: string): string {
    const node = byId.get(id);
    if (!node) return '';
    const parts: string[] = [];
    let cursor: string | null = id;
    const seen = new Set<string>();
    while (cursor !== null) {
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const cur = byId.get(cursor);
      if (!cur) break;
      parts.unshift(cur.name ?? '(sin nombre)');
      cursor = cur.parentId;
    }
    return parts.join(' / ');
  }

  return nodes
    .filter((n): n is Extract<TreeNode, { kind: 'folder' }> => n.kind === 'folder')
    .map((f) => ({ id: f.id, label: pathOf(f.id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

const MATCH_LABELS: Record<AutoGroupRuleMatchType, string> = {
  domain: 'Dominio',
  regex: 'Regex',
  'title-contains': 'Título contiene',
};

interface DraftRow {
  id: string; // sortable id (rule.id o "draft:xxx")
  pattern: string;
  matchType: AutoGroupRuleMatchType;
  targetFolderId: string;
  enabled: boolean;
  /**
   * undefined si la fila representa una regla persistida; string si está
   * sin guardar todavía. Se usa solo para identificar si el "guardar"
   * debe llamar create() o update().
   */
  draft?: 'new';
}

function ruleToDraft(rule: AutoGroupRule): DraftRow {
  return {
    id: rule.id,
    pattern: rule.pattern,
    matchType: rule.matchType,
    targetFolderId: rule.targetFolderId,
    enabled: rule.enabled,
  };
}

function newDraftId(): string {
  return `draft:${globalThis.crypto.randomUUID()}`;
}

export function RulesTab() {
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const activeWorkspace = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
    [workspaces, activeWorkspaceId],
  );

  const rulesStore = useRulesStore;
  const rules = useRulesStore((s) =>
    activeWorkspaceId ? (s.rulesByWorkspace[activeWorkspaceId] ?? null) : null,
  );

  const treeNodes = useTreeStore((s) =>
    activeWorkspaceId ? (s.nodesByWorkspace[activeWorkspaceId] ?? []) : [],
  );

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Hidratar reglas y árbol del workspace activo.
  useEffect(() => {
    if (!activeWorkspaceId) return;
    void rulesStore.getState().hydrate(activeWorkspaceId);
    if (!useTreeStore.getState().loadedWorkspaces.has(activeWorkspaceId)) {
      void useTreeStore.getState().hydrateWorkspace(activeWorkspaceId);
    }
  }, [activeWorkspaceId, rulesStore]);

  // Reconciliar drafts con reglas remotas: las nuevas filas no guardadas
  // (draft === 'new') se preservan; las persistidas se reemplazan por la
  // versión remota (en orden de prioridad).
  useEffect(() => {
    if (rules === null) return;
    setDrafts((prev) => {
      const newRows = prev.filter((d) => d.draft === 'new');
      return [...rules.map(ruleToDraft), ...newRows];
    });
  }, [rules]);

  const folderOptions = useMemo(() => buildFolderOptions(treeNodes), [treeNodes]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  if (!activeWorkspaceId || !activeWorkspace) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
        <p className="text-[12px] text-[var(--vela-fg-muted)]">
          Selecciona un workspace para gestionar sus reglas.
        </p>
      </div>
    );
  }

  function patchRow(id: string, patch: Partial<DraftRow>): void {
    setDrafts((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow(): void {
    const firstFolder = folderOptions[0]?.id;
    if (!firstFolder) {
      setError('Crea al menos una carpeta antes de añadir una regla.');
      return;
    }
    setError(null);
    setDrafts((prev) => [
      ...prev,
      {
        id: newDraftId(),
        pattern: '',
        matchType: 'domain',
        targetFolderId: firstFolder,
        enabled: true,
        draft: 'new',
      },
    ]);
  }

  async function saveRow(row: DraftRow): Promise<void> {
    if (row.pattern.trim().length === 0) {
      setError('El patrón no puede estar vacío.');
      return;
    }
    if (!folderOptions.some((f) => f.id === row.targetFolderId)) {
      setError('Selecciona una carpeta destino válida en este workspace.');
      return;
    }
    setError(null);
    try {
      if (row.draft === 'new') {
        await rulesStore.getState().create({
          workspaceId: activeWorkspaceId!,
          pattern: row.pattern.trim(),
          matchType: row.matchType,
          targetFolderId: row.targetFolderId,
          enabled: row.enabled,
        });
        setDrafts((prev) => prev.filter((r) => r.id !== row.id));
      } else {
        await rulesStore.getState().update({
          id: row.id,
          pattern: row.pattern.trim(),
          matchType: row.matchType,
          targetFolderId: row.targetFolderId,
          enabled: row.enabled,
        });
      }
      await rulesStore.getState().invalidate(activeWorkspaceId!);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteRow(row: DraftRow): Promise<void> {
    if (row.draft === 'new') {
      setDrafts((prev) => prev.filter((r) => r.id !== row.id));
      return;
    }
    try {
      await rulesStore.getState().delete(row.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const persisted = drafts.filter((d) => d.draft !== 'new');
    const oldIdx = persisted.findIndex((r) => r.id === active.id);
    const newIdx = persisted.findIndex((r) => r.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(persisted, oldIdx, newIdx);
    const ids = reordered.map((r) => r.id);
    setDrafts((prev) => {
      const newRows = prev.filter((d) => d.draft === 'new');
      return [...reordered, ...newRows];
    });
    try {
      await rulesStore
        .getState()
        .reorderPriority(activeWorkspaceId!, ids);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded border px-3 py-2 text-[12px] text-[var(--vela-fg-muted)]"
        style={{ borderColor: 'var(--vela-border)' }}
      >
        El comportamiento de Ctrl+Tab se configura en{' '}
        <button
          type="button"
          onClick={() => void window.api.window.openUrlInNewTab({ url: 'vela://settings#tabs', activate: true })}
          className="text-[var(--vela-accent)] hover:underline"
        >
          Ajustes → Pestañas
        </button>
        .
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[var(--vela-fg-muted)]">
          Reglas para{' '}
          <span className="text-[var(--vela-fg)]">{activeWorkspace.name}</span>.
          La primera regla habilitada que coincida mueve la pestaña a su
          carpeta destino.
        </p>
        <button
          type="button"
          onClick={addRow}
          className="rounded px-2 py-1 text-[12px] font-medium text-[var(--vela-fg)]"
          style={{ background: 'var(--vela-accent)' }}
        >
          + Nueva regla
        </button>
      </div>

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[12px] text-red-400">
          {error}
        </div>
      )}

      {rules === null ? (
        <p className="py-6 text-center text-[12px] text-[var(--vela-fg-muted)]">
          Cargando…
        </p>
      ) : drafts.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-[var(--vela-fg-muted)]">
          Sin reglas.
        </p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={(e) => void handleDragEnd(e)}>
          <SortableContext
            items={drafts.filter((d) => d.draft !== 'new').map((d) => d.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-1.5">
              {drafts.map((row) => (
                <RuleRow
                  key={row.id}
                  row={row}
                  folderOptions={folderOptions}
                  onPatch={(patch) => patchRow(row.id, patch)}
                  onSave={() => void saveRow(row)}
                  onDelete={() => void deleteRow(row)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

interface RuleRowProps {
  row: DraftRow;
  folderOptions: FolderOption[];
  onPatch: (patch: Partial<DraftRow>) => void;
  onSave: () => void;
  onDelete: () => void;
}

function RuleRow({ row, folderOptions, onPatch, onSave, onDelete }: RuleRowProps) {
  const sortable = useSortable({ id: row.id, disabled: row.draft === 'new' });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={sortable.setNodeRef}
      style={{ ...style, borderColor: 'var(--vela-border)' }}
      className="flex items-center gap-2 rounded border px-2 py-1.5"
    >
      <button
        type="button"
        ref={sortable.setActivatorNodeRef}
        {...sortable.listeners}
        {...sortable.attributes}
        disabled={row.draft === 'new'}
        title={
          row.draft === 'new'
            ? 'Guarda la regla antes de reordenar'
            : 'Arrastra para cambiar prioridad'
        }
        className="cursor-grab text-[var(--vela-fg-muted)] disabled:cursor-not-allowed disabled:opacity-30"
        aria-label="Reordenar"
      >
        ⋮⋮
      </button>

      <input
        type="checkbox"
        checked={row.enabled}
        onChange={(e) => onPatch({ enabled: e.target.checked })}
        title={row.enabled ? 'Habilitada' : 'Deshabilitada'}
      />

      <select
        value={row.matchType}
        onChange={(e) =>
          onPatch({ matchType: e.target.value as AutoGroupRuleMatchType })
        }
        className="rounded border bg-[var(--vela-bg-app)] px-1.5 py-1 text-[12px] text-[var(--vela-fg)]"
        style={{ borderColor: 'var(--vela-border)' }}
      >
        {(Object.keys(MATCH_LABELS) as AutoGroupRuleMatchType[]).map((mt) => (
          <option key={mt} value={mt}>
            {MATCH_LABELS[mt]}
          </option>
        ))}
      </select>

      <input
        type="text"
        value={row.pattern}
        onChange={(e) => onPatch({ pattern: e.target.value })}
        placeholder={
          row.matchType === 'domain'
            ? 'github.com o *.example.com'
            : row.matchType === 'regex'
              ? '^https://docs\\..+'
              : 'cadena en el título'
        }
        className="min-w-0 flex-1 rounded border bg-[var(--vela-bg-app)] px-2 py-1 text-[12px] text-[var(--vela-fg)] outline-none"
        style={{ borderColor: 'var(--vela-border)' }}
      />

      <select
        value={row.targetFolderId}
        onChange={(e) => onPatch({ targetFolderId: e.target.value })}
        className="max-w-[180px] rounded border bg-[var(--vela-bg-app)] px-1.5 py-1 text-[12px] text-[var(--vela-fg)]"
        style={{ borderColor: 'var(--vela-border)' }}
      >
        {folderOptions.length === 0 && (
          <option value="">(sin carpetas)</option>
        )}
        {folderOptions.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={onSave}
        className="rounded px-2 py-1 text-[12px] font-medium text-[var(--vela-fg)]"
        style={{ background: 'var(--vela-accent)' }}
      >
        {row.draft === 'new' ? 'Crear' : 'Guardar'}
      </button>

      <button
        type="button"
        onClick={onDelete}
        className="rounded px-2 py-1 text-[12px] text-red-400 hover:bg-red-500/10"
        aria-label="Eliminar regla"
      >
        ×
      </button>
    </div>
  );
}


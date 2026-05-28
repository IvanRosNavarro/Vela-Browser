import { useEffect, useMemo, useState } from 'react';
import type { Workspace } from '@vela/shared';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import {
  useTreeStore,
  useWorkspaceModalStore,
  useWorkspacesStore,
} from '../../stores';
import { WorkspaceForm } from './WorkspaceForm';
import { WorkspaceIcon } from './WorkspaceIcon';
import { RulesTab } from './RulesTab';

type ManageTab = 'workspaces' | 'rules';

interface DeleteConfirmState {
  workspace: Workspace;
  totalNodes: number;
  totalTabs: number;
  totalFolders: number;
}

function useEscToClose(close: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);
}

export function WorkspaceModal() {
  const open = useWorkspaceModalStore((s) => s.open);
  const mode = useWorkspaceModalStore((s) => s.mode);
  const editId = useWorkspaceModalStore((s) => s.editId);
  const close = useWorkspaceModalStore((s) => s.close);
  const openEdit = useWorkspaceModalStore((s) => s.openEdit);
  const openCreate = useWorkspaceModalStore((s) => s.openCreate);

  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const archivedWorkspaces = useWorkspacesStore(
    (s) => s.archivedWorkspaces,
  );
  const create = useWorkspacesStore((s) => s.create);
  const update = useWorkspacesStore((s) => s.update);
  const archive = useWorkspacesStore((s) => s.archive);
  const deleteWs = useWorkspacesStore((s) => s.delete);
  const setActive = useWorkspacesStore((s) => s.setActive);
  const reload = useWorkspacesStore((s) => s.reload);
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);

  const [manageTab, setManageTab] = useState<ManageTab>('workspaces');
  const [pendingDelete, setPendingDelete] =
    useState<DeleteConfirmState | null>(null);

  useEscToClose(close);

  useEffect(() => {
    if (open && mode === 'manage') setManageTab('workspaces');
    if (!open) setPendingDelete(null);
  }, [open, mode]);

  const allWorkspaces = useMemo(
    () => [...workspaces, ...archivedWorkspaces],
    [workspaces, archivedWorkspaces],
  );

  const editing = useMemo(
    () =>
      mode === 'edit' && editId
        ? allWorkspaces.find((w) => w.id === editId) ?? null
        : null,
    [mode, editId, allWorkspaces],
  );

  if (!open) return null;

  const renderHeader = (title: string): React.ReactNode => (
    <div
      className="flex items-center justify-between border-b px-5 py-3"
      style={{ borderColor: 'var(--vela-border)' }}
    >
      <h2 className="text-[14px] font-semibold text-[var(--vela-fg)]">
        {title}
      </h2>
      <button
        type="button"
        onClick={close}
        aria-label="Cerrar"
        className="rounded p-1 text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
      >
        ×
      </button>
    </div>
  );

  const onSubmitCreate = async (value: {
    name: string;
    icon: string | null;
    color: string | null;
  }): Promise<void> => {
    const ws = await create(value);
    await reload();
    await setActive(ws.id);
    close();
  };

  const onSubmitEdit = async (value: {
    name: string;
    icon: string | null;
    color: string | null;
  }): Promise<void> => {
    if (!editing) return;
    await update({ id: editing.id, ...value });
    await reload();
    close();
  };

  const askDelete = async (ws: Workspace): Promise<void> => {
    const tree = useTreeStore.getState();
    if (!tree.loadedWorkspaces.has(ws.id)) {
      await tree.hydrateWorkspace(ws.id);
    }
    const nodes =
      useTreeStore.getState().nodesByWorkspace[ws.id] ?? [];
    const totalTabs = nodes.filter((n) => n.kind === 'tab').length;
    const totalFolders = nodes.filter((n) => n.kind === 'folder').length;
    setPendingDelete({
      workspace: ws,
      totalNodes: nodes.length,
      totalTabs,
      totalFolders,
    });
  };

  const confirmDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    const id = pendingDelete.workspace.id;
    setPendingDelete(null);
    await deleteWs(id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-[560px] flex-col overflow-hidden rounded-lg shadow-2xl"
        style={{
          background: 'var(--vela-bg-sidebar-elev)',
          border: '1px solid var(--vela-border)',
        }}
      >
        {mode === 'create' && (
          <>
            {renderHeader('Nuevo workspace')}
            <div className="overflow-y-auto px-5 py-4">
              <WorkspaceForm
                onSubmit={onSubmitCreate}
                onCancel={close}
                submitLabel="Crear"
              />
            </div>
          </>
        )}

        {mode === 'edit' && (
          <>
            {renderHeader(`Editar workspace${editing ? ` — ${editing.name}` : ''}`)}
            <div className="overflow-y-auto px-5 py-4">
              {editing ? (
                <WorkspaceForm
                  initial={editing}
                  onSubmit={onSubmitEdit}
                  onCancel={close}
                  submitLabel="Guardar"
                />
              ) : (
                <p className="text-[13px] text-[var(--vela-fg-muted)]">
                  Workspace no encontrado.
                </p>
              )}
            </div>
          </>
        )}

        {mode === 'manage' && (
          <>
            {renderHeader('Gestionar workspaces')}
            <div
              className="flex shrink-0 gap-1 border-b px-5 pt-2"
              style={{ borderColor: 'var(--vela-border)' }}
            >
              <button
                type="button"
                onClick={() => setManageTab('workspaces')}
                className="border-b-2 px-3 py-1.5 text-[12px]"
                style={{
                  borderColor:
                    manageTab === 'workspaces'
                      ? 'var(--vela-accent)'
                      : 'transparent',
                  color:
                    manageTab === 'workspaces'
                      ? 'var(--vela-fg)'
                      : 'var(--vela-fg-muted)',
                }}
              >
                Workspaces
              </button>
              <button
                type="button"
                onClick={() => setManageTab('rules')}
                className="border-b-2 px-3 py-1.5 text-[12px]"
                style={{
                  borderColor:
                    manageTab === 'rules'
                      ? 'var(--vela-accent)'
                      : 'transparent',
                  color:
                    manageTab === 'rules'
                      ? 'var(--vela-fg)'
                      : 'var(--vela-fg-muted)',
                }}
              >
                Reglas
              </button>
              <div className="ml-auto pb-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => void openCreate()}
                  className="rounded px-2 py-1 text-[12px] font-medium text-[var(--vela-fg)]"
                  style={{ background: 'var(--vela-accent)' }}
                >
                  + Nuevo
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {manageTab === 'workspaces' ? (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr
                      className="border-b text-left"
                      style={{ borderColor: 'var(--vela-border)' }}
                    >
                      <th className="pb-2.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-[var(--vela-fg-muted)]">
                        Workspace
                      </th>
                      <th className="w-28 pb-2.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-[var(--vela-fg-muted)]">
                        Estado
                      </th>
                      <th className="pb-2.5 text-right text-[11px] font-medium uppercase tracking-wide text-[var(--vela-fg-muted)]">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {allWorkspaces.map((ws) => (
                      <ManageRow
                        key={ws.id}
                        ws={ws}
                        isActive={activeWorkspaceId === ws.id}
                        onEdit={() => void openEdit(ws.id)}
                        onArchiveToggle={async () => {
                          await archive({ id: ws.id, archived: !ws.archived });
                          await reload();
                        }}
                        onDelete={() => void askDelete(ws)}
                      />
                    ))}
                    {allWorkspaces.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="py-6 text-center text-[var(--vela-fg-muted)]"
                        >
                          No hay workspaces.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <RulesTab />
              )}
            </div>
          </>
        )}

        {pendingDelete && (
          <DeleteConfirm
            state={pendingDelete}
            onCancel={() => setPendingDelete(null)}
            onConfirm={confirmDelete}
          />
        )}
      </div>
    </div>
  );
}

interface ManageRowProps {
  ws: Workspace;
  isActive: boolean;
  onEdit: () => void;
  onArchiveToggle: () => Promise<void>;
  onDelete: () => void;
}

function ManageRow({
  ws,
  isActive,
  onEdit,
  onArchiveToggle,
  onDelete,
}: ManageRowProps) {
  return (
    <tr
      className="group border-b last:border-b-0 transition-colors hover:bg-[var(--vela-bg-row-hover)]"
      style={{ borderColor: 'var(--vela-border)' }}
    >
      <td className="py-2.5 pr-4">
        <div className="flex items-center gap-2.5">
          <WorkspaceIcon
            icon={ws.icon}
            fallbackName={ws.name}
            background={ws.color}
            size={22}
          />
          <span
            className="text-[13px]"
            style={{ color: ws.archived ? 'var(--vela-fg-muted)' : 'var(--vela-fg)' }}
          >
            {ws.name}
          </span>
          {isActive && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{ background: 'var(--vela-accent)', color: 'var(--vela-fg)' }}
            >
              Actual
            </span>
          )}
        </div>
      </td>
      <td className="w-28 py-2.5 pr-4">
        {ws.archived ? (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium"
            style={{
              background: 'var(--vela-bg-row-hover)',
              color: 'var(--vela-fg-muted)',
            }}
          >
            Archivado
          </span>
        ) : (
          <span className="text-[11px] text-[var(--vela-fg-muted)]">Activo</span>
        )}
      </td>
      <td className="py-2.5 text-right">
        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            onClick={onEdit}
            title="Editar"
            aria-label="Editar workspace"
            className="rounded p-1.5 text-[var(--vela-fg-muted)] transition-colors hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            onClick={() => void onArchiveToggle()}
            title={ws.archived ? 'Desarchivar' : 'Archivar'}
            aria-label={ws.archived ? 'Desarchivar workspace' : 'Archivar workspace'}
            className="rounded p-1.5 text-[var(--vela-fg-muted)] transition-colors hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
          >
            {ws.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Eliminar"
            aria-label="Eliminar workspace"
            className="rounded p-1.5 text-red-400/60 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}

interface DeleteConfirmProps {
  state: DeleteConfirmState;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

function DeleteConfirm({ state, onCancel, onConfirm }: DeleteConfirmProps) {
  const [loading, setLoading] = useState(false);
  const { workspace, totalTabs, totalFolders, totalNodes } = state;
  const handleConfirm = async (): Promise<void> => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
    >
      <div
        className="w-[420px] rounded-lg p-5 shadow-2xl"
        style={{
          background: 'var(--vela-bg-sidebar-elev)',
          border: '1px solid var(--vela-border)',
        }}
      >
        <h3 className="mb-2 text-[14px] font-semibold text-[var(--vela-fg)]">
          Eliminar “{workspace.name}”
        </h3>
        <p className="text-[12.5px] leading-relaxed text-[var(--vela-fg-muted)]">
          {totalNodes > 0 ? (
            <>
              Este workspace tiene{' '}
              <strong className="text-[var(--vela-fg)]">{totalTabs}</strong>{' '}
              pestañas y{' '}
              <strong className="text-[var(--vela-fg)]">{totalFolders}</strong>{' '}
              carpetas. Se eliminarán todas. ¿Continuar?
            </>
          ) : (
            <>El workspace está vacío. ¿Eliminar de todos modos?</>
          )}
        </p>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded px-3 py-1.5 text-[12px] text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={loading}
            className="rounded bg-red-500/90 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {loading ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import type { Workspace } from '@vela/shared';
import type { HistoryView } from './HistoryLayout';

interface Props {
  workspaces: Workspace[];
  workspaceCounts: Record<string, number>;
  view: HistoryView;
  workspaceFilter: string | null;
  onViewChange: (view: HistoryView) => void;
  onWorkspaceFilter: (id: string | null) => void;
  onDeleteAll: (workspaceId?: string) => void;
}

export function HistorySidebar({
  workspaces,
  workspaceCounts,
  view,
  workspaceFilter,
  onViewChange,
  onWorkspaceFilter,
  onDeleteAll,
}: Props) {
  function NavItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
          active
            ? 'bg-[var(--vela-accent)]/15 font-medium text-[var(--vela-accent)]'
            : 'text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-surface-hover)] hover:text-[var(--vela-fg)]'
        }`}
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex w-52 flex-shrink-0 flex-col gap-1 border-r border-[var(--vela-border)] bg-[var(--vela-bg-sidebar)] p-3">
      <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-[var(--vela-fg-muted)]">
        Historial
      </p>

      <NavItem
        label="Todo el historial"
        active={view === 'all' && workspaceFilter === null}
        onClick={() => { onViewChange('all'); onWorkspaceFilter(null); }}
      />
      <NavItem
        label="Dominios visitados"
        active={view === 'domain-list'}
        onClick={() => onViewChange('domain-list')}
      />

      {workspaces.length > 0 && (
        <>
          <div className="my-2 border-t border-[var(--vela-border)]" />
          <p className="px-2 text-xs font-semibold uppercase tracking-wider text-[var(--vela-fg-muted)]">
            Por workspace
          </p>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => { onViewChange('all'); onWorkspaceFilter(ws.id); }}
              className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm transition-colors ${
                workspaceFilter === ws.id
                  ? 'bg-[var(--vela-accent)]/15 font-medium text-[var(--vela-accent)]'
                  : 'text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-surface-hover)] hover:text-[var(--vela-fg)]'
              }`}
            >
              <span className="truncate">{ws.name}</span>
              {workspaceCounts[ws.id] !== undefined && (
                <span className="ml-1 shrink-0 rounded-full bg-[var(--vela-border)] px-1.5 py-0.5 text-xs text-[var(--vela-fg-muted)]">
                  {workspaceCounts[ws.id]}
                </span>
              )}
            </button>
          ))}
        </>
      )}

      <div className="mt-auto pt-2 border-t border-[var(--vela-border)]">
        <ClearButton
          workspaceFilter={workspaceFilter}
          workspaceName={workspaces.find((w) => w.id === workspaceFilter)?.name}
          onDeleteAll={onDeleteAll}
        />
      </div>
    </div>
  );
}

function ClearButton({
  workspaceFilter,
  workspaceName,
  onDeleteAll,
}: {
  workspaceFilter: string | null;
  workspaceName?: string;
  onDeleteAll: (workspaceId?: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <div className="flex flex-col gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 p-2">
        <p className="text-xs text-[var(--vela-fg)]">
          {workspaceFilter
            ? `¿Eliminar el historial de "${workspaceName}"?`
            : '¿Eliminar todo el historial?'}
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => { onDeleteAll(workspaceFilter ?? undefined); setConfirm(false); }}
            className="flex-1 rounded bg-red-500/90 px-2 py-1 text-xs text-white hover:bg-red-500"
          >
            Eliminar
          </button>
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="flex-1 rounded border border-[var(--vela-border)] px-2 py-1 text-xs text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-surface-hover)]"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirm(true)}
      className="w-full rounded-md px-3 py-1.5 text-left text-sm text-red-400 hover:bg-red-500/10"
    >
      Limpiar datos…
    </button>
  );
}

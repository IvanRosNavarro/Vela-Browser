import { useState } from 'react';
import type { DomainStat } from '@vela/shared';

interface Props {
  stats: DomainStat[];
  workspaceFilter: string | null;
  query: string;
  onViewDomain: (domain: string) => void;
  onDeleteDomain: (domain: string) => void;
}

function relativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return 'hoy';
  if (diffDays === 1) return 'hace 1 día';
  if (diffDays < 30) return `hace ${diffDays} días`;
  const months = Math.floor(diffDays / 30);
  if (months === 1) return 'hace 1 mes';
  if (months < 12) return `hace ${months} meses`;
  return `hace ${Math.floor(months / 12)} años`;
}

export function DomainView({ stats, query, onViewDomain, onDeleteDomain }: Props) {
  const [sortBy, setSortBy] = useState<'visits' | 'recent'>('visits');

  const filtered = stats
    .filter((d) => !query || d.domain.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) =>
      sortBy === 'visits'
        ? b.visitCount - a.visitCount
        : b.lastVisitedAt - a.lastVisitedAt,
    );

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-[var(--vela-fg)]">
          {filtered.length} dominio{filtered.length !== 1 ? 's' : ''}
        </h2>
        <div className="ml-auto flex rounded-lg border border-[var(--vela-border)] overflow-hidden text-xs">
          <button
            type="button"
            onClick={() => setSortBy('visits')}
            className={`px-3 py-1.5 transition-colors ${sortBy === 'visits' ? 'bg-[var(--vela-accent)] text-white' : 'text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-surface-hover)]'}`}
          >
            Más visitados
          </button>
          <button
            type="button"
            onClick={() => setSortBy('recent')}
            className={`px-3 py-1.5 transition-colors ${sortBy === 'recent' ? 'bg-[var(--vela-accent)] text-white' : 'text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-surface-hover)]'}`}
          >
            Más recientes
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <p className="text-sm text-[var(--vela-fg-muted)]">No hay dominios visitados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((stat) => (
            <DomainCard
              key={stat.domain}
              stat={stat}
              onViewHistory={() => onViewDomain(stat.domain)}
              onDelete={() => onDeleteDomain(stat.domain)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DomainCard({
  stat,
  onViewHistory,
  onDelete,
}: {
  stat: DomainStat;
  onViewHistory: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="group relative rounded-xl border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] p-4 transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => setConfirmDelete(true)}
        className="absolute right-2 top-2 rounded p-1 text-[var(--vela-fg-muted)] opacity-0 hover:bg-[var(--vela-border)] hover:text-red-400 group-hover:opacity-100"
        title="Eliminar todo de este dominio"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>

      <div className="mb-3 flex items-center gap-2">
        {stat.favicon ? (
          <img
            src={stat.favicon}
            alt=""
            className="h-5 w-5 rounded object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="h-5 w-5 rounded bg-[var(--vela-border)]" />
        )}
        <span className="truncate text-sm font-medium text-[var(--vela-fg)]">{stat.domain}</span>
      </div>

      <div className="mb-3">
        <p className="text-2xl font-bold text-[var(--vela-fg)]">{stat.visitCount}</p>
        <p className="text-xs text-[var(--vela-fg-muted)]">
          visita{stat.visitCount !== 1 ? 's' : ''}
        </p>
        <p className="mt-0.5 text-xs text-[var(--vela-fg-muted)]">
          Última: {relativeTime(stat.lastVisitedAt)}
        </p>
      </div>

      <button
        type="button"
        onClick={onViewHistory}
        className="w-full rounded-md border border-[var(--vela-border)] py-1 text-xs text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-surface-hover)] hover:text-[var(--vela-fg)]"
      >
        Ver historial
      </button>

      {confirmDelete && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-[var(--vela-bg-surface)]/95 p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-center text-xs text-[var(--vela-fg)]">
            ¿Eliminar todo de <strong>{stat.domain}</strong>?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { onDelete(); setConfirmDelete(false); }}
              className="rounded bg-red-500/90 px-3 py-1 text-xs text-white hover:bg-red-500"
            >
              Eliminar
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="rounded border border-[var(--vela-border)] px-3 py-1 text-xs text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-surface-hover)]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

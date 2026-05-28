import type { HistorySearchEntry } from '@vela/shared';

interface Props {
  entry: HistorySearchEntry;
  onDelete: (id: string) => void;
}

function getDomain(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export function HistoryEntryItem({ entry, onDelete }: Props) {
  function handleClick() {
    window.location.href = entry.url;
  }

  return (
    <div className="group flex items-center gap-3 px-4 py-1.5 hover:bg-[var(--vela-bg-surface-hover)]">
      <div className="flex h-4 w-4 shrink-0 items-center justify-center">
        {entry.favicon ? (
          <img
            src={entry.favicon}
            alt=""
            className="h-4 w-4 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="h-3 w-3 rounded-full bg-[var(--vela-border)]" />
        )}
      </div>

      <button
        type="button"
        onClick={handleClick}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-sm text-[var(--vela-fg)] hover:underline">
          {entry.title || getDomain(entry.url)}
        </span>
        <span className="block truncate text-xs text-[var(--vela-fg-muted)]">
          {getDomain(entry.url)}
        </span>
      </button>

      <span className="shrink-0 text-xs text-[var(--vela-fg-muted)]">
        {formatTime(entry.visitedAt)}
      </span>

      <button
        type="button"
        onClick={() => onDelete(entry.id)}
        className="ml-1 shrink-0 rounded p-0.5 text-[var(--vela-fg-muted)] opacity-0 hover:bg-[var(--vela-border)] hover:text-[var(--vela-fg)] group-hover:opacity-100"
        title="Eliminar entrada"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

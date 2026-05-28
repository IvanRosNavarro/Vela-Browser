import type { HistorySearchEntry, HistorySession } from '@vela/shared';
import { HistoryList } from './HistoryList';

interface Props {
  entries: HistorySearchEntry[];
  sessions: HistorySession[];
  domainFilter: string | null;
  onDeleteEntry: (id: string) => void;
  onRestoreSession: (session: HistorySession) => void;
  onClearDomainFilter: () => void;
}

export function HistoryContent({
  entries,
  sessions,
  domainFilter,
  onDeleteEntry,
  onRestoreSession,
  onClearDomainFilter,
}: Props) {
  return (
    <div className="flex-1 overflow-y-auto">
      {domainFilter && (
        <div className="flex items-center gap-2 border-b border-[var(--vela-border)] bg-[var(--vela-accent)]/10 px-5 py-2">
          <span className="text-sm text-[var(--vela-fg)]">
            Mostrando historial de <strong>{domainFilter}</strong>
          </span>
          <button
            type="button"
            onClick={onClearDomainFilter}
            className="ml-auto rounded border border-[var(--vela-border)] px-2 py-0.5 text-xs text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-surface-hover)]"
          >
            Quitar filtro
          </button>
        </div>
      )}
      <HistoryList
        entries={entries}
        sessions={sessions}
        onDeleteEntry={onDeleteEntry}
        onRestoreSession={onRestoreSession}
      />
    </div>
  );
}

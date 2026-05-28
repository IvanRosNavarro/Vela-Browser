import type { HistorySearchEntry, HistorySession } from '@vela/shared';
import { SessionGroup } from './SessionGroup';

interface Props {
  entries: HistorySearchEntry[];
  sessions: HistorySession[];
  onDeleteEntry: (id: string) => void;
  onRestoreSession: (session: HistorySession) => void;
}

export function HistoryList({ entries, sessions, onDeleteEntry, onRestoreSession }: Props) {
  if (sessions.length === 0 || entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <svg className="h-10 w-10 text-[var(--vela-fg-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <p className="text-sm text-[var(--vela-fg-muted)]">No hay entradas en el historial.</p>
      </div>
    );
  }

  // Index entries by day (same format as session.sessionId: "YYYY-MM-DD")
  const entriesByDay: Record<string, HistorySearchEntry[]> = {};
  for (const entry of entries) {
    const day = new Date(entry.visitedAt).toISOString().slice(0, 10);
    const bucket = entriesByDay[day];
    if (!bucket) { entriesByDay[day] = [entry]; } else { bucket.push(entry); }
  }

  return (
    <div>
      {sessions.map((session) => {
        const dayEntries = entriesByDay[session.sessionId] ?? [];
        if (dayEntries.length === 0) return null;
        return (
          <SessionGroup
            key={session.sessionId}
            session={session}
            entries={dayEntries}
            onDeleteEntry={onDeleteEntry}
            onRestoreSession={onRestoreSession}
          />
        );
      })}
    </div>
  );
}

import { useState } from 'react';
import type { HistorySearchEntry, HistorySession } from '@vela/shared';
import { HistoryEntryItem } from './HistoryEntryItem';

const SESSION_GAP_MS = 30 * 60 * 1000; // 30 min

interface Props {
  session: HistorySession;
  entries: HistorySearchEntry[];
  onDeleteEntry: (id: string) => void;
  onRestoreSession: (session: HistorySession) => void;
}

function formatDateLabel(sessionId: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const date = new Date(sessionId);
  date.setHours(0, 0, 0, 0);

  if (date.getTime() === today.getTime()) return 'Hoy';
  if (date.getTime() === yesterday.getTime()) return 'Ayer';

  return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

interface EntryGroup {
  entries: HistorySearchEntry[];
  gapBefore?: number;
}

function splitByGaps(entries: HistorySearchEntry[]): EntryGroup[] {
  if (entries.length === 0) return [];
  const sorted = [...entries].sort((a, b) => b.visitedAt - a.visitedAt);
  const first = sorted[0];
  if (!first) return [];
  const groups: EntryGroup[] = [{ entries: [first] }];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (!prev || !curr) continue;
    const gap = prev.visitedAt - curr.visitedAt;
    const last = groups[groups.length - 1];
    if (gap > SESSION_GAP_MS) {
      groups.push({ entries: [curr], gapBefore: gap });
    } else if (last) {
      last.entries.push(curr);
    }
  }
  return groups;
}

function formatGap(ms: number): string {
  const h = Math.round(ms / 3_600_000);
  if (h < 1) return 'Pausa de menos de 1 hora';
  return `Pausa de ${h} hora${h !== 1 ? 's' : ''}`;
}

export function SessionGroup({ session, entries, onDeleteEntry, onRestoreSession }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const groups = splitByGaps(entries);

  return (
    <div className="border-b border-[var(--vela-border)]">
      <div className="flex items-center justify-between px-4 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-left"
        >
          <svg
            className={`h-3.5 w-3.5 text-[var(--vela-fg-muted)] transition-transform ${collapsed ? '-rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
          <span className="text-sm font-semibold text-[var(--vela-fg)]">
            {formatDateLabel(session.sessionId)}
          </span>
          <span className="text-xs text-[var(--vela-fg-muted)]">
            {session.entryCount} visita{session.entryCount !== 1 ? 's' : ''}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onRestoreSession(session)}
          className="rounded-md border border-[var(--vela-border)] px-2.5 py-1 text-xs text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-surface-hover)] hover:text-[var(--vela-fg)]"
          title="Abrir todas las URLs del día como tabs"
        >
          Restaurar sesión
        </button>
      </div>

      {!collapsed && (
        <div className="pb-1">
          {groups.map((group, gi) => (
            <div key={gi}>
              {group.gapBefore !== undefined && (
                <div className="flex items-center gap-2 px-4 py-1">
                  <div className="h-px flex-1 bg-[var(--vela-border)]" />
                  <span className="text-xs text-[var(--vela-fg-muted)]">
                    {formatGap(group.gapBefore)}
                  </span>
                  <div className="h-px flex-1 bg-[var(--vela-border)]" />
                </div>
              )}
              {group.entries.map((entry) => (
                <HistoryEntryItem
                  key={entry.id}
                  entry={entry}
                  onDelete={onDeleteEntry}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { HistoryView } from './HistoryLayout';

type TimeRange = 'today' | 'week' | 'month' | 'all';

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
  { value: 'all', label: 'Todo' },
];

interface Props {
  query: string;
  timeRange: TimeRange;
  view: HistoryView;
  onQueryChange: (q: string) => void;
  onTimeRangeChange: (r: TimeRange) => void;
}

export function HistoryToolbar({ query, timeRange, view, onQueryChange, onTimeRangeChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => onQueryChange(local), 200);
    return () => clearTimeout(t);
  }, [local, onQueryChange]);

  useEffect(() => {
    if (query !== local) setLocal(query);
  }, [query]);

  return (
    <div className="flex items-center gap-3 border-b border-[var(--vela-border)] bg-[var(--vela-bg-app)] px-5 py-3">
      <div className="relative flex-1 max-w-lg">
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--vela-fg-muted)]"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          placeholder={view === 'domain-list' ? 'Filtrar dominios…' : 'Buscar en el historial…'}
          className="w-full rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] py-1.5 pl-9 pr-3 text-sm text-[var(--vela-fg)] placeholder:text-[var(--vela-fg-muted)] outline-none focus:border-[var(--vela-accent)]"
        />
        {local && (
          <button
            type="button"
            onClick={() => { setLocal(''); onQueryChange(''); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)]"
          >
            ×
          </button>
        )}
      </div>

      {view !== 'domain-list' && (
        <select
          value={timeRange}
          onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
          className="rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-3 py-1.5 text-sm text-[var(--vela-fg)] outline-none focus:border-[var(--vela-accent)]"
        >
          {TIME_RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}

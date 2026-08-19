import { Cpu, Monitor, Puzzle, Server, Wrench } from 'lucide-react';

import type { SystemProcessKind, SystemProcessResource } from '@vela/shared';

interface Props {
  process: SystemProcessResource;
  /** Memoria de la fila más pesada del modal (KB), para escalar la barra. */
  maxRss: number;
}

function iconFor(kind: SystemProcessKind) {
  switch (kind) {
    case 'browser':
      return Server;
    case 'gpu':
      return Monitor;
    case 'utility':
      return Wrench;
    case 'renderer':
      return Puzzle;
    default:
      return Cpu;
  }
}

function barColor(pct: number): string {
  if (pct < 50) return 'var(--vela-success, #22c55e)';
  if (pct < 80) return '#eab308';
  return '#ef4444';
}

export function ResourcesProcessRow({ process, maxRss }: Props) {
  const pct = maxRss > 0 ? (process.memoryRss / maxRss) * 100 : 0;
  const mb = process.memoryRss / 1024;
  const Icon = iconFor(process.kind);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--vela-border)]/20">
      <div className="flex h-4 w-4 shrink-0 items-center justify-center">
        <Icon className="h-3.5 w-3.5 text-[var(--vela-fg-muted)]" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs text-[var(--vela-fg)]" title={process.detail ?? process.name}>
            {process.name}
          </span>
        </div>

        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 flex-1 rounded-full bg-[var(--vela-border)]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: barColor(pct) }}
            />
          </div>
          <span className="w-16 shrink-0 text-right text-[10px] text-[var(--vela-fg-muted)]">
            {mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <span className="text-[10px] text-[var(--vela-fg-muted)]" title={`PID ${process.pid}`}>
          {process.pid}
        </span>
      </div>

      {/* Hueco equivalente al de las acciones de las filas de pestaña, para que
          las columnas de ambas listas queden alineadas. */}
      <div className="w-[104px] shrink-0" />
    </div>
  );
}

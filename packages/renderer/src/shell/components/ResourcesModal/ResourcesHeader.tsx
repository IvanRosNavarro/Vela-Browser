import { X } from 'lucide-react';

interface Props {
  /** Memoria de todos los procesos de la app, en MB. */
  totalMemoryMb: number;
  processCount: number;
  /** Memoria sumada de las pestañas de este perfil, en MB. */
  tabsMemoryMb: number;
  /** Memoria sumada del resto de procesos, en MB. */
  otherMemoryMb: number;
  onClose: () => void;
}

function fmt(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
}

export function ResourcesHeader({
  totalMemoryMb,
  processCount,
  tabsMemoryMb,
  otherMemoryMb,
  onClose,
}: Props) {
  return (
    <div className="flex items-start justify-between border-b border-[var(--vela-border)] px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--vela-fg)]">Uso de recursos</h2>
        <p className="mt-0.5 text-xs text-[var(--vela-fg-muted)]">
          Total: <span className="font-medium text-[var(--vela-fg)]">{fmt(totalMemoryMb)}</span>
          {' · '}
          {processCount} {processCount === 1 ? 'proceso' : 'procesos'}
        </p>
        <p className="mt-0.5 text-[10px] text-[var(--vela-fg-muted)]">
          Pestañas {fmt(tabsMemoryMb)} · Otros procesos {fmt(otherMemoryMb)}
        </p>
      </div>
      <button
        onClick={onClose}
        className="rounded-md p-1 text-[var(--vela-fg-muted)] transition-colors hover:bg-[var(--vela-border)]/50 hover:text-[var(--vela-fg)]"
        aria-label="Cerrar"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

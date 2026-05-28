import { X } from 'lucide-react';

interface Props {
  totalMemoryMb: number;
  onClose: () => void;
}

export function ResourcesHeader({ totalMemoryMb, onClose }: Props) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--vela-border)] px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-[var(--vela-fg)]">Uso de recursos</h2>
        <p className="mt-0.5 text-xs text-[var(--vela-fg-muted)]">
          Total: {totalMemoryMb.toFixed(1)} MB
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

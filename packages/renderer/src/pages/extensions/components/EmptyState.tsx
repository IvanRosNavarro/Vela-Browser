import { Puzzle } from 'lucide-react';

interface Props {
  onInstall(): void;
}

export function EmptyState({ onInstall }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <Puzzle className="h-12 w-12 text-[var(--vela-fg-muted)]" strokeWidth={1} />
      <p className="text-sm text-[var(--vela-fg-muted)]">
        No tienes extensiones instaladas
      </p>
      <button
        onClick={onInstall}
        className="rounded-md bg-[var(--vela-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity"
      >
        Instalar desde archivo .crx
      </button>
    </div>
  );
}

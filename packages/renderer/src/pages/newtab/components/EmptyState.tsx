import { VelaLogo } from '../../../shared-ui/VelaLogo';

interface Props {
  children?: React.ReactNode;
}

export function EmptyState({ children }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <VelaLogo size={4} opacity={0.4} />
      <h1 className="text-2xl font-semibold text-[var(--vela-fg)]">
        Bienvenido a Vela
      </h1>
      <p className="text-sm text-[var(--vela-fg-muted)]">
        Empieza escribiendo una URL o buscando.
      </p>
      <button
        type="button"
        onClick={() => void window.api.commands.execute('internal.openHistory')}
        className="text-xs text-[var(--vela-accent)] hover:underline"
      >
        Busca en el historial completo →
      </button>
      {children}
    </div>
  );
}

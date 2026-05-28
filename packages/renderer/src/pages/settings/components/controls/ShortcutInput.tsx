interface Props {
  value: string;
  onChange?: (v: string) => void;
}

export function ShortcutInput({ value }: Props) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-2 py-0.5 text-xs text-[var(--vela-fg-muted)] opacity-60">
      {value || '—'}
      <span className="text-[10px] text-[var(--vela-fg-muted)]">(Fase 4C)</span>
    </span>
  );
}

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function ColorInput({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-7 cursor-pointer rounded border border-[var(--vela-border)] bg-transparent p-0.5"
      />
      <span className="font-mono text-xs text-[var(--vela-fg-muted)]">{value}</span>
    </div>
  );
}

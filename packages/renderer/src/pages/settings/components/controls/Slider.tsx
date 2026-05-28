interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}

export function Slider({ value, min, max, step = 1, onChange }: Props) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-32 cursor-pointer accent-[var(--vela-accent)]"
      />
      <span className="w-8 text-right text-xs tabular-nums text-[var(--vela-fg-muted)]">
        {value}
      </span>
    </div>
  );
}

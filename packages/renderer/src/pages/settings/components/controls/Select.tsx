export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
}

export function Select<T extends string>({ value, options, onChange, disabled = false }: Props<T>) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-2 py-1 text-sm text-[var(--vela-fg)] outline-none focus:border-[var(--vela-accent)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

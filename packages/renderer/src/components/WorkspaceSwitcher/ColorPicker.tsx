import { useState } from 'react';

const PALETTE: ReadonlyArray<{ name: string; value: string }> = [
  { name: 'Rojo', value: '#ef4444' },
  { name: 'Naranja', value: '#f97316' },
  { name: 'Ámbar', value: '#f59e0b' },
  { name: 'Verde', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cian', value: '#06b6d4' },
  { name: 'Azul', value: '#3b82f6' },
  { name: 'Índigo', value: '#6366f1' },
  { name: 'Violeta', value: '#8b5cf6' },
  { name: 'Fucsia', value: '#d946ef' },
  { name: 'Rosa', value: '#ec4899' },
  { name: 'Gris', value: '#6b7280' },
];

const HEX_PATTERN = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export interface ColorPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const presetMatch = value
    ? PALETTE.find((c) => c.value.toLowerCase() === value.toLowerCase())
    : null;
  const [customMode, setCustomMode] = useState(
    Boolean(value) && !presetMatch,
  );
  const [customValue, setCustomValue] = useState(
    !presetMatch && value ? value : '#3b82f6',
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {PALETTE.map((color) => {
          const selected =
            !customMode && value?.toLowerCase() === color.value.toLowerCase();
          return (
            <button
              type="button"
              key={color.value}
              title={color.name}
              onClick={() => {
                setCustomMode(false);
                onChange(color.value);
              }}
              className="rounded-md transition"
              style={{
                width: 24,
                height: 24,
                background: color.value,
                outline: selected
                  ? '2px solid var(--vela-fg)'
                  : '1px solid transparent',
                outlineOffset: 1,
              }}
            />
          );
        })}
        <button
          type="button"
          onClick={() => {
            setCustomMode(true);
            if (HEX_PATTERN.test(customValue)) onChange(customValue);
          }}
          className="rounded-md text-[11px] font-medium"
          style={{
            width: 56,
            height: 24,
            border: '1px dashed var(--vela-border)',
            color: customMode ? 'var(--vela-fg)' : 'var(--vela-fg-muted)',
            background: customMode ? 'var(--vela-bg-row-hover)' : 'transparent',
          }}
        >
          Custom
        </button>
        <button
          type="button"
          onClick={() => {
            setCustomMode(false);
            onChange(null);
          }}
          className="rounded-md text-[11px] font-medium"
          style={{
            width: 56,
            height: 24,
            border: '1px dashed var(--vela-border)',
            color: value === null ? 'var(--vela-fg)' : 'var(--vela-fg-muted)',
            background:
              value === null ? 'var(--vela-bg-row-hover)' : 'transparent',
          }}
        >
          Sin color
        </button>
      </div>
      {customMode && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={
              HEX_PATTERN.test(customValue) && customValue.length === 7
                ? customValue
                : '#3b82f6'
            }
            onChange={(e) => {
              setCustomValue(e.target.value);
              onChange(e.target.value);
            }}
            className="h-7 w-10 cursor-pointer rounded border border-[var(--vela-border)] bg-transparent"
          />
          <input
            type="text"
            value={customValue}
            onChange={(e) => {
              const next = e.target.value;
              setCustomValue(next);
              if (HEX_PATTERN.test(next)) onChange(next);
            }}
            placeholder="#3b82f6"
            className="rounded border bg-[var(--vela-bg-app)] px-2 py-1 text-[12px] text-[var(--vela-fg)] outline-none"
            style={{ borderColor: 'var(--vela-border)', width: 110 }}
          />
        </div>
      )}
    </div>
  );
}

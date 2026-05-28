import type { AddressBarMode } from './useAddressBar';

interface ModeChipProps {
  mode: Exclude<AddressBarMode, 'url' | 'search'>;
  engineName?: string;
  onClear: () => void;
}

const MODE_CONFIG: Record<
  Exclude<AddressBarMode, 'url' | 'search'>,
  { label: string; bg: string; color: string }
> = {
  command: { label: 'Comandos', bg: 'rgba(139,92,246,0.2)', color: '#a78bfa' },
  history: { label: 'Historial', bg: 'rgba(59,130,246,0.2)', color: '#60a5fa' },
  tabs:    { label: 'Pestañas', bg: 'rgba(16,185,129,0.2)', color: '#34d399' },
  engine:  { label: '',         bg: 'rgba(249,115,22,0.2)', color: '#fb923c' },
};

export function ModeChip({ mode, engineName, onClear }: ModeChipProps) {
  const cfg = MODE_CONFIG[mode];
  const label = mode === 'engine' ? (engineName ?? 'Motor') : cfg.label;

  return (
    <button
      type="button"
      title="Click para borrar el prefijo"
      onClick={onClear}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 6px',
        borderRadius: 4,
        background: cfg.bg,
        color: cfg.color,
        border: 'none',
        cursor: 'pointer',
        fontSize: 10,
        fontWeight: 600,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      {label}
    </button>
  );
}

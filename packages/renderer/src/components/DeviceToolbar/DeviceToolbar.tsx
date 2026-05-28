import { type CSSProperties, useRef, useState, useEffect } from 'react';
import { DEVICE_PRESETS } from '@vela/shared';
import { useDeviceEmulationStore, DEVICE_TOOLBAR_HEIGHT } from '../../stores/deviceEmulationStore';

const DPR_OPTIONS = [1, 1.5, 2, 2.625, 3];

// ─── CustomSelect ───────────────────────────────────────────────────────────
// Native <select> popup ignores CSS vars on Windows (native OS rendering).
// This custom component renders entirely in the page, so CSS vars always work.

interface SelectOption { value: string; label: string }

function CustomSelect({
  options,
  value,
  onChange,
  style,
}: {
  options: SelectOption[];
  value: string;
  onChange: (v: string) => void;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const trigger: CSSProperties & { WebkitAppRegion?: string } = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    background: 'var(--vela-bg-elevated)',
    border: '1px solid var(--vela-border)',
    borderRadius: 4,
    color: 'var(--vela-fg)',
    fontSize: 12,
    padding: '2px 6px',
    cursor: 'pointer',
    outline: 'none',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    WebkitAppRegion: 'no-drag',
    ...style,
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        style={trigger}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {selected?.label ?? value}
        </span>
        <svg width="8" height="8" viewBox="0 0 10 6" fill="currentColor" style={{ opacity: 0.6, flexShrink: 0 }}>
          <path d="M0 0l5 6 5-6z" />
        </svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 3px)',
            left: 0,
            zIndex: 300,
            background: 'var(--vela-bg-elevated)',
            border: '1px solid var(--vela-border-strong)',
            borderRadius: 4,
            boxShadow: '0 6px 16px rgba(0,0,0,0.5)',
            minWidth: '100%',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {options.map((o) => (
            <DropdownItem
              key={o.value}
              label={o.label}
              active={o.value === value}
              onClick={() => { onChange(o.value); setOpen(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DropdownItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '5px 12px',
        fontSize: 12,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        color: active ? 'var(--vela-accent)' : 'var(--vela-fg)',
        background: hover ? 'var(--vela-bg-row-hover)' : 'transparent',
      }}
    >
      {label}
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const inputStyle: CSSProperties = {
  width: 52,
  background: 'var(--vela-bg-elevated)',
  border: '1px solid var(--vela-border)',
  borderRadius: 4,
  color: 'var(--vela-fg)',
  fontSize: 12,
  padding: '2px 4px',
  textAlign: 'center',
  outline: 'none',
  WebkitAppRegion: 'no-drag',
} as CSSProperties;

const iconBtnStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  borderRadius: 4,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--vela-fg-muted)',
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
  WebkitAppRegion: 'no-drag',
} as CSSProperties;

function Separator() {
  return (
    <div
      aria-hidden
      style={{
        width: 1,
        height: 16,
        background: 'var(--vela-border)',
        flexShrink: 0,
        margin: '0 4px',
      }}
    />
  );
}

// ─── DeviceToolbar ───────────────────────────────────────────────────────────

export function DeviceToolbar() {
  const {
    active,
    presetId,
    width,
    height,
    dpr,
    landscape,
    applyPreset,
    setDimensions,
    setDpr,
    toggleLandscape,
    deactivate,
  } = useDeviceEmulationStore();

  const widthRef = useRef<HTMLInputElement>(null);
  const heightRef = useRef<HTMLInputElement>(null);

  if (!active) return null;

  const displayW = landscape ? height : width;
  const displayH = landscape ? width : height;

  function commitDimensions() {
    const w = parseInt(widthRef.current?.value ?? String(displayW), 10);
    const h = parseInt(heightRef.current?.value ?? String(displayH), 10);
    if (!isNaN(w) && !isNaN(h) && w >= 100 && h >= 100) {
      const pw = landscape ? h : w;
      const ph = landscape ? w : h;
      void setDimensions(pw, ph);
    }
  }

  const presetOptions: SelectOption[] = [
    ...(presetId === null ? [{ value: 'custom', label: 'Personalizado' }] : []),
    ...DEVICE_PRESETS.map((p) => ({ value: p.id, label: p.name })),
  ];

  const dprOptions: SelectOption[] = DPR_OPTIONS.map((d) => ({ value: String(d), label: `${d}x` }));

  return (
    <div
      style={{
        height: DEVICE_TOOLBAR_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 12px',
        background: 'var(--vela-titlebar-bg)',
        borderBottom: '1px solid var(--vela-border)',
        flexShrink: 0,
        WebkitAppRegion: 'no-drag',
        userSelect: 'none',
        zIndex: 99,
      } as CSSProperties}
    >
      {/* Preset selector */}
      <CustomSelect
        options={presetOptions}
        value={presetId ?? 'custom'}
        onChange={(v) => { if (v !== 'custom') void applyPreset(v); }}
        style={{ minWidth: 150, maxWidth: 170 }}
      />

      <Separator />

      {/* Width */}
      <input
        ref={widthRef}
        type="number"
        style={inputStyle}
        defaultValue={displayW}
        key={`w-${displayW}`}
        min={100}
        max={10000}
        title="Anchura (px)"
        onBlur={commitDimensions}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
      />
      <span style={{ fontSize: 12, color: 'var(--vela-fg-muted)', flexShrink: 0 }}>×</span>
      {/* Height */}
      <input
        ref={heightRef}
        type="number"
        style={inputStyle}
        defaultValue={displayH}
        key={`h-${displayH}`}
        min={100}
        max={10000}
        title="Altura (px)"
        onBlur={commitDimensions}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
      />

      <Separator />

      {/* DPR */}
      <CustomSelect
        options={dprOptions}
        value={String(dpr)}
        onChange={(v) => void setDpr(parseFloat(v))}
        style={{ width: 60 }}
      />

      <Separator />

      {/* Rotate */}
      <button
        style={{
          ...iconBtnStyle,
          color: landscape ? 'var(--vela-accent)' : 'var(--vela-fg-muted)',
        }}
        title={landscape ? 'Modo horizontal (activo)' : 'Rotar a horizontal'}
        onClick={() => void toggleLandscape()}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Close */}
      <button
        style={{ ...iconBtnStyle, color: 'var(--vela-fg-muted)' }}
        title="Salir del modo dispositivo"
        onClick={() => void deactivate()}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

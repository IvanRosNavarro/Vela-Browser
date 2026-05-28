import { useEffect, useMemo, useRef, useState } from 'react';
import { fuzzyFilter } from '../../../lib/fuzzy';
import type { PaletteCommandDef, PaletteArg } from './paletteCommands';

interface CommandPaletteArgsProps {
  command: PaletteCommandDef;
  argValues: Record<string, string>;
  onArgChange: (argId: string, value: string) => void;
  onExecute: () => void;
  onBack: () => void;
  tabOptions: Array<{ value: string; label: string }>;
  workspaceOptions: Array<{ value: string; label: string }>;
}

export function CommandPaletteArgs({
  command,
  argValues,
  onArgChange,
  onExecute,
  onBack,
  tabOptions,
  workspaceOptions,
}: CommandPaletteArgsProps) {
  const args = command.args ?? [];
  const [focusedArgIndex, setFocusedArgIndex] = useState(0);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => { firstInputRef.current?.focus(); });
  }, []);

  const canExecute = args.every(
    (a) => !a.required || (argValues[a.id]?.trim() ?? ''),
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onBack(); return; }
    if (e.key === 'Enter' && canExecute) { e.preventDefault(); onExecute(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const next = e.shiftKey
        ? (focusedArgIndex - 1 + args.length) % args.length
        : (focusedArgIndex + 1) % args.length;
      setFocusedArgIndex(next);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }} onKeyDown={handleKeyDown}>
      {/* Header with back button */}
      <button
        onClick={onBack}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          background: 'none',
          border: 'none',
          borderBottom: '1px solid var(--vela-border)',
          cursor: 'pointer',
          color: 'var(--vela-fg)',
          fontFamily: 'var(--vela-font-family)',
          fontSize: 13,
          textAlign: 'left',
          flexShrink: 0,
        }}
      >
        <span style={{ color: 'var(--vela-fg-muted)' }}>←</span>
        <span style={{ fontWeight: 500 }}>{command.title}</span>
      </button>

      {/* Arg inputs */}
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto' }}>
        {args.map((arg, i) => (
          <ArgInput
            key={arg.id}
            arg={arg}
            value={argValues[arg.id] ?? ''}
            onChange={(v) => onArgChange(arg.id, v)}
            isFocused={focusedArgIndex === i}
            inputRef={i === 0 ? firstInputRef : undefined}
            onFocus={() => setFocusedArgIndex(i)}
            tabOptions={tabOptions}
            workspaceOptions={workspaceOptions}
          />
        ))}
      </div>

      {/* Execute button */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--vela-border)', flexShrink: 0 }}>
        <button
          onClick={onExecute}
          disabled={!canExecute}
          style={{
            width: '100%',
            padding: '8px 16px',
            borderRadius: 'var(--vela-radius-sm)',
            background: canExecute ? 'var(--vela-accent)' : 'var(--vela-bg)',
            color: canExecute ? 'var(--vela-accent-fg)' : 'var(--vela-fg-muted)',
            border: '1px solid var(--vela-border)',
            cursor: canExecute ? 'pointer' : 'not-allowed',
            fontSize: 13,
            fontWeight: 500,
            fontFamily: 'var(--vela-font-family)',
            transition: 'background 120ms',
          }}
        >
          Ejecutar — Enter
        </button>
      </div>
    </div>
  );
}

interface ArgInputProps {
  arg: PaletteArg;
  value: string;
  onChange: (v: string) => void;
  isFocused: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
  onFocus: () => void;
  tabOptions: Array<{ value: string; label: string }>;
  workspaceOptions: Array<{ value: string; label: string }>;
}

function ArgInput({ arg, value, onChange, inputRef, onFocus, tabOptions, workspaceOptions }: ArgInputProps) {
  const [filterQuery, setFilterQuery] = useState('');

  const options = useMemo(() => {
    if (arg.type === 'tab') return tabOptions;
    if (arg.type === 'workspace') return workspaceOptions;
    if (arg.type === 'select') return arg.options ?? [];
    return [];
  }, [arg, tabOptions, workspaceOptions]);

  const filteredOptions = useMemo(() => {
    if (!filterQuery) return options;
    return fuzzyFilter(options, filterQuery, (o) => o.label).map((o) => o);
  }, [options, filterQuery]);

  const selectedLabel = options.find((o) => o.value === value)?.label;

  if (arg.type === 'string') {
    return (
      <div>
        <label style={{ fontSize: 11, color: 'var(--vela-fg-muted)', display: 'block', marginBottom: 4 }}>
          {arg.label}{arg.required && ' *'}
        </label>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          placeholder={arg.placeholder ?? arg.label}
          style={{
            width: '100%',
            padding: '6px 10px',
            borderRadius: 'var(--vela-radius-sm)',
            background: 'var(--vela-bg)',
            border: '1px solid var(--vela-border)',
            color: 'var(--vela-fg)',
            fontSize: 13,
            fontFamily: 'var(--vela-font-family)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
    );
  }

  // select / tab / workspace — filterable list
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--vela-fg-muted)', display: 'block', marginBottom: 4 }}>
        {arg.label}{arg.required && ' *'}
        {selectedLabel && <span style={{ color: 'var(--vela-accent)', marginLeft: 6 }}>✓ {selectedLabel}</span>}
      </label>
      <input
        ref={inputRef}
        value={filterQuery}
        onChange={(e) => setFilterQuery(e.target.value)}
        onFocus={onFocus}
        placeholder={`Buscar ${arg.label.toLowerCase()}…`}
        style={{
          width: '100%',
          padding: '6px 10px',
          borderRadius: 'var(--vela-radius-sm)',
          background: 'var(--vela-bg)',
          border: '1px solid var(--vela-border)',
          color: 'var(--vela-fg)',
          fontSize: 13,
          fontFamily: 'var(--vela-font-family)',
          outline: 'none',
          marginBottom: 6,
          boxSizing: 'border-box',
        }}
      />
      <div style={{ maxHeight: 180, overflowY: 'auto', borderRadius: 'var(--vela-radius-sm)', border: '1px solid var(--vela-border)' }}>
        {filteredOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => { onChange(opt.value); setFilterQuery(''); }}
            style={{
              display: 'block',
              width: '100%',
              padding: '6px 10px',
              background: value === opt.value ? 'var(--vela-sidebar-active-bg)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: value === opt.value ? 'var(--vela-accent)' : 'var(--vela-fg)',
              textAlign: 'left',
              fontSize: 13,
              fontFamily: 'var(--vela-font-family)',
            }}
          >
            {opt.label || <span style={{ color: 'var(--vela-fg-muted)' }}>Sin color</span>}
          </button>
        ))}
        {filteredOptions.length === 0 && (
          <div style={{ padding: '8px 10px', color: 'var(--vela-fg-muted)', fontSize: 12 }}>Sin resultados</div>
        )}
      </div>
    </div>
  );
}

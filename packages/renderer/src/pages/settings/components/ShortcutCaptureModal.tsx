import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const RESERVED_NORMALIZED = '';

function buildSystemNormalized(
  modifier: 'ctrl' | 'alt',
  platform: string,
): ReadonlySet<string> {
  const wsMod = modifier === 'alt' ? 'Alt' : (platform === 'darwin' ? 'Meta' : 'Ctrl');
  return new Set([
    `${wsMod}+Digit1`, `${wsMod}+Digit2`, `${wsMod}+Digit3`,
    `${wsMod}+Digit4`, `${wsMod}+Digit5`, `${wsMod}+Digit6`,
    `${wsMod}+Digit7`, `${wsMod}+Digit8`, `${wsMod}+Digit9`,
    'Ctrl+Tab',
    'Ctrl+Shift+Tab',
  ]);
}

// Combos reservados por el SO (advertencia, no bloqueo)
const OS_RESERVED: Record<string, string[]> = {
  win32: ['Ctrl+Alt+Delete', 'Meta+L', 'Meta+D'],
  darwin: ['Meta+Space', 'Meta+Tab', 'Ctrl+Space', 'Meta+Q'],
  linux: [],
};

const platform = window.api?.platform ?? 'linux';

function codeToDisplayKey(code: string): string | null {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (/^F\d+$/.test(code)) return code;
  const map: Record<string, string> = {
    Tab: 'Tab', Enter: 'Enter', Escape: 'Escape', Space: 'Space',
    Backspace: 'Backspace', Delete: 'Delete',
    ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
    BracketLeft: '[', BracketRight: ']',
    Comma: ',', Period: '.', Slash: '/', Semicolon: ';',
    Quote: "'", Backquote: '`', Backslash: '\\', Minus: '-', Equal: '=',
  };
  return map[code] ?? null;
}

function buildComboString(e: KeyboardEvent): string | null {
  const displayKey = codeToDisplayKey(e.code);
  if (!displayKey) return null;
  // Solo acepta combos con al menos un modificador
  const hasMod = e.ctrlKey || e.shiftKey || e.altKey || e.metaKey;
  if (!hasMod) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  if (e.metaKey) parts.push('Meta');
  parts.push(displayKey);
  return parts.join('+');
}

function normalizeForComparison(combo: string): string {
  const parts = combo.split('+');
  const key = parts[parts.length - 1] ?? '';
  const mods = parts.slice(0, -1);
  let code = key;
  if (/^[A-Z]$/.test(key)) code = `Key${key}`;
  else if (/^[0-9]$/.test(key)) code = `Digit${key}`;
  else if (key === 'Left') code = 'ArrowLeft';
  else if (key === 'Right') code = 'ArrowRight';
  else if (key === 'Up') code = 'ArrowUp';
  else if (key === 'Down') code = 'ArrowDown';
  else if (key === '[') code = 'BracketLeft';
  else if (key === ']') code = 'BracketRight';
  else if (key === ',') code = 'Comma';
  else if (key === '.') code = 'Period';
  else if (key === '/') code = 'Slash';
  else if (key === ';') code = 'Semicolon';
  else if (key === "'") code = 'Quote';
  else if (key === '`') code = 'Backquote';
  else if (key === '\\') code = 'Backslash';
  else if (key === '-') code = 'Minus';
  else if (key === '=') code = 'Equal';
  return [...mods, code].join('+');
}

export interface ConflictInfo {
  commandId: string;
  commandTitle: string;
}

interface Props {
  commandTitle: string;
  currentShortcut?: string;
  allShortcuts: Array<{ id: string; title: string; effectiveShortcut?: string }>;
  workspaceSwitchModifier?: 'ctrl' | 'alt';
  onSave: (shortcut: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}

type ModalState =
  | { phase: 'listening' }
  | { phase: 'captured'; combo: string }
  | { phase: 'conflict'; combo: string; conflict: ConflictInfo }
  | { phase: 'reserved'; combo: string }
  | { phase: 'os-warning'; combo: string; osCombo: string };

export function ShortcutCaptureModal({
  commandTitle,
  currentShortcut,
  allShortcuts,
  workspaceSwitchModifier = 'alt',
  onSave,
  onRemove,
  onCancel,
}: Props) {
  const systemNormalized = buildSystemNormalized(workspaceSwitchModifier, platform);
  const [state, setState] = useState<ModalState>({ phase: 'listening' });
  const [live, setLive] = useState<string>('');

  useEffect(() => {
    if (state.phase !== 'listening') return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();

      // Solo teclas modificadoras por sí solas → actualizar live display
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
        const mods: string[] = [];
        if (e.ctrlKey) mods.push('Ctrl');
        if (e.shiftKey) mods.push('Shift');
        if (e.altKey) mods.push('Alt');
        if (e.metaKey) mods.push('Meta');
        setLive(mods.join('+') + '+…');
        return;
      }

      const combo = buildComboString(e);
      if (!combo) return;

      setLive(combo);

      // Comprobación: combinación reservada
      const normalized = normalizeForComparison(combo);
      if (normalized === RESERVED_NORMALIZED) {
        setState({ phase: 'reserved', combo });
        return;
      }
      if (systemNormalized.has(normalized)) {
        setState({ phase: 'reserved', combo });
        return;
      }

      // Comprobación: OS-reserved
      const osReservedList = OS_RESERVED[platform] ?? [];
      const osMatch = osReservedList.find(
        (r) => normalizeForComparison(r) === normalized,
      );
      if (osMatch) {
        setState({ phase: 'os-warning', combo, osCombo: osMatch });
        return;
      }

      // Comprobación: conflicto con otro comando
      const conflict = allShortcuts.find((s) => {
        if (!s.effectiveShortcut) return false;
        return normalizeForComparison(s.effectiveShortcut) === normalized;
      });
      if (conflict) {
        setState({
          phase: 'conflict',
          combo,
          conflict: { commandId: conflict.id, commandTitle: conflict.title },
        });
        return;
      }

      setState({ phase: 'captured', combo });
    };

    const handleKeyUp = (): void => {
      // Cuando se sueltan todas las teclas sin haber fijado combo, limpiar live
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [state.phase, allShortcuts]);

  const reset = (): void => {
    setLive('');
    setState({ phase: 'listening' });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-[420px] rounded-xl border border-[var(--vela-border)] bg-[var(--vela-bg-overlay)] p-6 shadow-2xl">
        {/* Cabecera */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs text-[var(--vela-fg-muted)]">Editando atajo para</p>
            <p className="font-medium text-[var(--vela-fg)]">{commandTitle}</p>
            {currentShortcut && (
              <p className="text-xs text-[var(--vela-fg-muted)]">
                Actual: <kbd className="rounded bg-[var(--vela-bg-subtle)] px-1 py-0.5 font-mono text-xs">{currentShortcut}</kbd>
              </p>
            )}
          </div>
          <button
            onClick={onCancel}
            className="rounded p-1 text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-hover)] hover:text-[var(--vela-fg)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Área de captura */}
        {state.phase === 'listening' && (
          <div className="mb-6 flex min-h-[72px] items-center justify-center rounded-lg border-2 border-dashed border-[var(--vela-accent)] bg-[var(--vela-bg-subtle)]">
            {live ? (
              <kbd className="font-mono text-lg font-semibold text-[var(--vela-fg)]">{live}</kbd>
            ) : (
              <p className="text-sm text-[var(--vela-fg-muted)]">Pulsa la combinación de teclas…</p>
            )}
          </div>
        )}

        {state.phase === 'captured' && (
          <div className="mb-4 rounded-lg border border-[var(--vela-accent)] bg-[var(--vela-bg-subtle)] p-4 text-center">
            <kbd className="font-mono text-xl font-semibold text-[var(--vela-accent)]">{state.combo}</kbd>
          </div>
        )}

        {state.phase === 'reserved' && (
          <div className="mb-4 rounded-lg border border-[var(--vela-error,#ef4444)] bg-[var(--vela-bg-subtle)] p-4">
            <p className="text-sm font-medium text-[var(--vela-error,#ef4444)]">Atajo reservado</p>
            <p className="mt-1 text-sm text-[var(--vela-fg-muted)]">
              {normalizeForComparison(state.combo) === RESERVED_NORMALIZED
                ? 'Este atajo está reservado para el Command Palette. No se puede reasignar.'
                : `La combinación "${state.combo}" está reservada por el sistema.`}
            </p>
            <button
              className="mt-3 text-xs text-[var(--vela-accent)] underline"
              onClick={reset}
            >
              Intentar otra combinación
            </button>
          </div>
        )}

        {state.phase === 'os-warning' && (
          <div className="mb-4 space-y-3">
            <div className="rounded-lg border border-[var(--vela-warning,#f59e0b)] bg-[var(--vela-bg-subtle)] p-4">
              <p className="text-sm font-medium text-[var(--vela-warning,#f59e0b)]">Advertencia</p>
              <p className="mt-1 text-sm text-[var(--vela-fg-muted)]">
                La combinación{' '}
                <kbd className="font-mono font-medium">{state.combo}</kbd>{' '}
                suele estar reservada por el sistema operativo y puede no funcionar correctamente.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onSave(state.combo)}
                className="flex-1 rounded-lg bg-[var(--vela-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Guardar de todas formas
              </button>
              <button
                onClick={reset}
                className="flex-1 rounded-lg border border-[var(--vela-border)] px-4 py-2 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-bg-hover)]"
              >
                Cambiar
              </button>
            </div>
          </div>
        )}

        {state.phase === 'conflict' && (
          <div className="mb-4 space-y-3">
            <div className="rounded-lg border border-[var(--vela-warning,#f59e0b)] bg-[var(--vela-bg-subtle)] p-4">
              <p className="text-sm font-medium text-[var(--vela-fg)]">Conflicto de atajo</p>
              <p className="mt-1 text-sm text-[var(--vela-fg-muted)]">
                La combinación{' '}
                <kbd className="font-mono font-medium">{state.combo}</kbd>{' '}
                ya está asignada a <span className="font-medium text-[var(--vela-fg)]">{state.conflict.commandTitle}</span>.
                ¿Quieres reasignarla?
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onSave(state.combo)}
                className="flex-1 rounded-lg bg-[var(--vela-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Reasignar
              </button>
              <button
                onClick={reset}
                className="flex-1 rounded-lg border border-[var(--vela-border)] px-4 py-2 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-bg-hover)]"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Botones principales (estados listening y captured) */}
        {(state.phase === 'listening' || state.phase === 'captured') && (
          <div className="flex gap-2">
            {state.phase === 'captured' && (
              <button
                onClick={() => onSave(state.combo)}
                className="flex-1 rounded-lg bg-[var(--vela-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Guardar
              </button>
            )}
            <button
              onClick={onRemove}
              className="flex-1 rounded-lg border border-[var(--vela-border)] px-4 py-2 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-bg-hover)]"
            >
              Quitar atajo
            </button>
            <button
              onClick={onCancel}
              className="flex-1 rounded-lg border border-[var(--vela-border)] px-4 py-2 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-bg-hover)]"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

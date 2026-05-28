import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MousePointer, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import type { ShortcutCommandInfo } from '@vela/shared';
import {
  useGesturesStore,
  DEFAULT_GESTURE_BINDINGS,
  type GestureBinding,
} from '../../../stores/gesturesStore';
import { getDirection } from '../../../shell/hooks/useMouseGestures';

// ─── Utilities ───────────────────────────────────────────────────────────────

function patternToArrows(pattern: string[]): string {
  return pattern
    .map((d) =>
      d === 'left' ? '←' : d === 'right' ? '→' : d === 'up' ? '↑' : '↓',
    )
    .join('');
}

function patternKey(pattern: string[]): string {
  return pattern.join('+');
}

// ─── Gesture recorder canvas ─────────────────────────────────────────────────

function GestureRecorderCanvas({
  onPatternChange,
}: {
  onPatternChange: (pattern: string[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(false);
  const segStartRef = useRef({ x: 0, y: 0 });
  const segmentsRef = useRef<string[]>([]);
  const currentDirRef = useRef<string | null>(null);
  const currentDistRef = useRef(0);
  const trailRef = useRef<Array<{ x: number; y: number }>>([]);

  const MIN_SEG_PX = 40;

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const points = trailRef.current;
    if (points.length < 2) return;

    const accentColor =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--vela-accent')
        .trim() || '#7d8cff';

    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);

    ctx.beginPath();
    points.forEach(({ x, y }, i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    const firstPt = points[0];
    if (!firstPt) return;
    ctx.beginPath();
    ctx.arc(firstPt.x, firstPt.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = accentColor;
    ctx.globalAlpha = 0.4;
    ctx.fill();
  }, []);

  const resetState = useCallback(() => {
    activeRef.current = false;
    segmentsRef.current = [];
    currentDirRef.current = null;
    currentDistRef.current = 0;
    trailRef.current = [];
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    onPatternChange([]);
  }, [onPatternChange]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      activeRef.current = true;
      segStartRef.current = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
      segmentsRef.current = [];
      currentDirRef.current = null;
      currentDistRef.current = 0;
      trailRef.current = [{ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }];
      onPatternChange([]);
    },
    [onPatternChange],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!activeRef.current) return;

      const ox = e.nativeEvent.offsetX;
      const oy = e.nativeEvent.offsetY;
      trailRef.current.push({ x: ox, y: oy });
      drawCanvas();

      const totalDx = ox - segStartRef.current.x;
      const totalDy = oy - segStartRef.current.y;
      const dir = getDirection(totalDx, totalDy);
      if (dir === null) return;

      if (currentDirRef.current !== dir) {
        if (
          currentDirRef.current !== null &&
          currentDistRef.current >= MIN_SEG_PX
        ) {
          segmentsRef.current.push(currentDirRef.current);
        }
        currentDirRef.current = dir;
        currentDistRef.current = 0;
        segStartRef.current = { x: ox, y: oy };
      } else {
        currentDistRef.current = Math.sqrt(
          totalDx * totalDx + totalDy * totalDy,
        );
      }
    },
    [drawCanvas],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!activeRef.current) return;
      activeRef.current = false;

      if (
        currentDirRef.current !== null &&
        currentDistRef.current >= MIN_SEG_PX
      ) {
        segmentsRef.current.push(currentDirRef.current);
      }

      onPatternChange([...segmentsRef.current]);
    },
    [onPatternChange],
  );

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-[var(--vela-fg-muted)]">
        Dibuja el gesto con el botón izquierdo del ratón:
      </p>
      <canvas
        ref={canvasRef}
        width={300}
        height={180}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          display: 'block',
          border: '1px solid var(--vela-border)',
          borderRadius: '8px',
          background: 'var(--vela-bg-subtle)',
          cursor: 'crosshair',
          touchAction: 'none',
        }}
      />
      <button
        type="button"
        onClick={resetState}
        className="self-start text-xs text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)]"
      >
        Limpiar
      </button>
    </div>
  );
}

// ─── Gesture edit modal ───────────────────────────────────────────────────────

function GestureEditModal({
  existing,
  commands,
  onSave,
  onClose,
}: {
  existing: GestureBinding | null;
  commands: ShortcutCommandInfo[];
  onSave: (pattern: string[], commandId: string, label: string) => void;
  onClose: () => void;
}) {
  const [pattern, setPattern] = useState<string[]>(existing?.pattern ?? []);
  const [commandId, setCommandId] = useState(existing?.commandId ?? '');
  const [cmdSearch, setCmdSearch] = useState('');

  const filteredCommands = useMemo(() => {
    const q = cmdSearch.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    );
  }, [commands, cmdSearch]);

  const selectedCmd = commands.find((c) => c.id === commandId);

  const canSave = pattern.length > 0 && commandId !== '';

  const handleSave = () => {
    if (!canSave) return;
    const label = selectedCmd
      ? `${patternToArrows(pattern)} ${selectedCmd.title}`
      : patternToArrows(pattern);
    onSave(pattern, commandId, label);
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[480px] rounded-xl border border-[var(--vela-border)] bg-[var(--vela-bg-card)] p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--vela-fg)]">
            {existing ? 'Editar gesto' : 'Nuevo gesto'}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-hover)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5">
          {/* Pattern recorder */}
          <div>
            <GestureRecorderCanvas onPatternChange={setPattern} />
            {pattern.length > 0 && (
              <p className="mt-2 text-sm font-medium text-[var(--vela-fg)]">
                Patrón reconocido:{' '}
                <span className="text-[var(--vela-accent)]">
                  {patternToArrows(pattern)}
                </span>
              </p>
            )}
            {pattern.length === 0 && (
              <p className="mt-2 text-xs text-[var(--vela-fg-muted)]">
                Dibuja un gesto para reconocer el patrón.
              </p>
            )}
          </div>

          {/* Command selector */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--vela-fg-muted)]">
              Acción
            </label>
            <input
              type="text"
              placeholder="Buscar comando…"
              value={cmdSearch}
              onChange={(e) => setCmdSearch(e.target.value)}
              className="mb-2 w-full rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-input)] px-3 py-1.5 text-sm text-[var(--vela-fg)] placeholder:text-[var(--vela-fg-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--vela-accent)]"
            />
            <div className="max-h-36 overflow-y-auto rounded-lg border border-[var(--vela-border)]">
              {filteredCommands.map((cmd) => (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => setCommandId(cmd.id)}
                  className={[
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--vela-bg-hover)]',
                    commandId === cmd.id
                      ? 'bg-[var(--vela-accent)]/10 text-[var(--vela-accent)]'
                      : 'text-[var(--vela-fg)]',
                  ].join(' ')}
                >
                  {cmd.title}
                  <span className="ml-auto text-xs text-[var(--vela-fg-muted)]">
                    {cmd.id}
                  </span>
                </button>
              ))}
              {filteredCommands.length === 0 && (
                <p className="px-3 py-2 text-xs text-[var(--vela-fg-muted)]">
                  Sin resultados.
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-[var(--vela-border)] px-3 py-1.5 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-bg-hover)]"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="rounded-lg bg-[var(--vela-accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 hover:opacity-90"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GestureSettings() {
  const {
    enabled,
    showTrail,
    minSegmentPx,
    bindings,
    setEnabled,
    setShowTrail,
    setMinSegmentPx,
    setBinding,
    removeBinding,
    resetToDefaults,
  } = useGesturesStore();

  const [commands, setCommands] = useState<ShortcutCommandInfo[]>([]);
  const [modal, setModal] = useState<{
    existing: GestureBinding | null;
  } | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);

  useEffect(() => {
    void window.api.shortcuts.getAll().then((res) => {
      if (res.ok) setCommands(res.data);
    });
  }, []);

  const handleSaveBinding = useCallback(
    async (pattern: string[], commandId: string, label: string) => {
      await setBinding(pattern, commandId, label);
      setModal(null);
    },
    [setBinding],
  );

  const handleRemoveBinding = useCallback(
    async (pattern: string[]) => {
      await removeBinding(pattern);
    },
    [removeBinding],
  );

  const handleResetDefaults = useCallback(async () => {
    await resetToDefaults();
    setResetConfirm(false);
  }, [resetToDefaults]);

  const isDefault = useCallback(
    (binding: GestureBinding) => {
      return DEFAULT_GESTURE_BINDINGS.some(
        (d) => patternKey(d.pattern) === patternKey(binding.pattern),
      );
    },
    [],
  );

  return (
    <>
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--vela-fg-muted)]">
            <MousePointer size={13} />
            Gestos de ratón
          </h2>
        </div>

        <p className="text-xs text-[var(--vela-fg-muted)]">
          Los gestos funcionan en el sidebar (no en el sidebar flotante ni en el área de contenido web).
        </p>

        <div className="overflow-hidden rounded-lg border border-[var(--vela-border)]">
          {/* Enable gestures */}
          <label className="flex cursor-pointer items-center justify-between bg-[var(--vela-bg-card)] px-4 py-3 hover:bg-[var(--vela-bg-hover)]">
            <span className="text-sm text-[var(--vela-fg)]">
              Activar gestos de ratón
            </span>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => void setEnabled(e.target.checked)}
              className="accent-[var(--vela-accent)]"
            />
          </label>

          {/* Show trail */}
          <label className="flex cursor-pointer items-center justify-between border-t border-[var(--vela-border)] bg-[var(--vela-bg-card)] px-4 py-3 hover:bg-[var(--vela-bg-hover)]">
            <span className="text-sm text-[var(--vela-fg)]">
              Mostrar trazo durante el gesto
            </span>
            <input
              type="checkbox"
              checked={showTrail}
              disabled={!enabled}
              onChange={(e) => void setShowTrail(e.target.checked)}
              className="accent-[var(--vela-accent)] disabled:opacity-50"
            />
          </label>

          {/* Min segment slider */}
          <div className="flex items-center justify-between border-t border-[var(--vela-border)] bg-[var(--vela-bg-card)] px-4 py-3">
            <span className="text-sm text-[var(--vela-fg)]">
              Distancia mínima por segmento
            </span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={40}
                max={120}
                step={5}
                value={minSegmentPx}
                disabled={!enabled}
                onChange={(e) => void setMinSegmentPx(Number(e.target.value))}
                className="w-24 accent-[var(--vela-accent)] disabled:opacity-50"
              />
              <span className="w-10 text-right text-xs text-[var(--vela-fg-muted)]">
                {minSegmentPx}px
              </span>
            </div>
          </div>
        </div>

        {/* Bindings table */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-[var(--vela-fg-muted)]">
              Tabla de gestos
            </p>
            {resetConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--vela-fg)]">
                  ¿Restaurar defaults?
                </span>
                <button
                  onClick={() => void handleResetDefaults()}
                  className="rounded bg-[var(--vela-error,#ef4444)] px-2 py-0.5 text-xs text-white hover:opacity-90"
                >
                  Restaurar
                </button>
                <button
                  onClick={() => setResetConfirm(false)}
                  className="rounded border border-[var(--vela-border)] px-2 py-0.5 text-xs text-[var(--vela-fg)] hover:bg-[var(--vela-bg-hover)]"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setResetConfirm(true)}
                disabled={!enabled}
                className="flex items-center gap-1 text-xs text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)] disabled:opacity-40"
              >
                <RotateCcw size={12} />
                Restaurar defaults
              </button>
            )}
          </div>

          <div className="divide-y divide-[var(--vela-border)] overflow-hidden rounded-lg border border-[var(--vela-border)]">
            {bindings.map((binding) => (
              <div
                key={patternKey(binding.pattern)}
                className="flex items-center gap-3 bg-[var(--vela-bg-card)] px-4 py-2.5"
              >
                <span className="w-12 text-lg leading-none">
                  {patternToArrows(binding.pattern)}
                </span>
                <span className="flex-1 text-sm text-[var(--vela-fg)]">
                  {binding.label.replace(/^[←→↑↓]+\s*/, '')}
                </span>
                {!isDefault(binding) && (
                  <span className="rounded-full bg-[var(--vela-accent)]/10 px-1.5 py-0.5 text-[10px] text-[var(--vela-accent)]">
                    custom
                  </span>
                )}
                <button
                  onClick={() => setModal({ existing: binding })}
                  disabled={!enabled}
                  className="rounded border border-[var(--vela-border)] px-2 py-0.5 text-xs text-[var(--vela-fg)] hover:bg-[var(--vela-bg-hover)] disabled:opacity-40"
                >
                  Editar
                </button>
                <button
                  onClick={() => void handleRemoveBinding(binding.pattern)}
                  disabled={!enabled}
                  className="rounded-md p-1 text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-hover)] hover:text-[var(--vela-error,#ef4444)] disabled:opacity-40"
                  title="Eliminar gesto"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}

            {bindings.length === 0 && (
              <div className="px-4 py-3 text-sm text-[var(--vela-fg-muted)]">
                No hay gestos configurados.
              </div>
            )}

            {/* Add gesture button */}
            <button
              onClick={() => setModal({ existing: null })}
              disabled={!enabled}
              className="flex w-full items-center gap-2 bg-[var(--vela-bg-card)] px-4 py-2.5 text-sm text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-hover)] hover:text-[var(--vela-fg)] disabled:opacity-40"
            >
              <Plus size={14} />
              Añadir gesto
            </button>
          </div>
        </div>
      </section>

      {modal !== null && (
        <GestureEditModal
          existing={modal.existing}
          commands={commands}
          onSave={(pattern, commandId, label) =>
            void handleSaveBinding(pattern, commandId, label)
          }
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

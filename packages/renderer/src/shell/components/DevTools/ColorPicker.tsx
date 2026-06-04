import { useCallback } from 'react';
import { useDevToolsStore, type PickedColor } from '../../../stores/devtoolsStore';

function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return `hsl(0, 0%, ${Math.round(l * 100)}%)`;
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex items-center justify-between gap-2 rounded px-3 py-1.5 cursor-pointer hover:bg-[var(--vela-bg-hover)] transition-colors"
      onClick={() => void window.api.clipboard.writeText(value)}
      title="Clic para copiar"
    >
      <span className="text-xs text-[var(--vela-fg-muted)] w-12 shrink-0">{label}</span>
      <span className="text-sm font-mono text-[var(--vela-fg)] flex-1 truncate">{value}</span>
      <span className="text-xs text-[var(--vela-fg-muted)]">⎘</span>
    </div>
  );
}

function ColorSwatch({ color, onClick }: { color: PickedColor; onClick: () => void }) {
  return (
    <button
      className="w-7 h-7 rounded border border-[var(--vela-border)] shrink-0 cursor-pointer hover:scale-110 transition-transform"
      style={{ background: color.hex }}
      title={color.hex}
      onClick={onClick}
    />
  );
}

export function ColorPicker() {
  const pickedColor = useDevToolsStore((s) => s.pickedColor);
  const colorHistory = useDevToolsStore((s) => s.colorHistory);
  const startEyedropper = useDevToolsStore((s) => s.startEyedropper);
  const receiveColor = useDevToolsStore((s) => s.receiveColor);

  const current = pickedColor ?? colorHistory[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      <button
        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--vela-border)] hover:bg-[var(--vela-bg-hover)] transition-colors w-full text-left"
        onClick={startEyedropper}
      >
        <span className="text-xl shrink-0">🎨</span>
        <div>
          <div className="text-sm font-medium text-[var(--vela-fg)]">Activar eyedropper</div>
          <div className="text-xs text-[var(--vela-fg-muted)] mt-0.5">
            Esta ventana se cerrará. Haz clic en cualquier píxel de la pantalla, incluyendo el contenido web.
          </div>
        </div>
      </button>

      {current && (
        <div className="flex flex-col gap-1 rounded-xl overflow-hidden border border-[var(--vela-border)]">
          <div className="h-20 w-full" style={{ background: current.hex }} />
          <div className="p-2 flex flex-col gap-0.5">
            <CopyRow label="HEX" value={current.hex} />
            <CopyRow label="RGB" value={`rgb(${current.r}, ${current.g}, ${current.b})`} />
            <CopyRow label="HSL" value={hexToHsl(current.hex)} />
          </div>
        </div>
      )}

      {colorHistory.length > 0 && (
        <div>
          <p className="text-xs text-[var(--vela-fg-muted)] mb-2">Historial de sesión</p>
          <div className="flex flex-wrap gap-2">
            {colorHistory.map((c) => (
              <ColorSwatch key={c.hex} color={c} onClick={() => receiveColor(c)} />
            ))}
          </div>
        </div>
      )}

      {!current && (
        <p className="text-sm text-[var(--vela-fg-muted)] text-center py-6">
          Activa el eyedropper para capturar el color de cualquier píxel de la pantalla.
        </p>
      )}
    </div>
  );
}

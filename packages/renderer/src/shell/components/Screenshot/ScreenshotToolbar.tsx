import type { Dispatch, SetStateAction } from 'react';

export type Tool =
  | 'select'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'text'
  | 'highlight'
  | 'blur';

export const PALETTE = [
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ffffff',
  '#000000',
] as const;

export const STROKE_WIDTHS = [1, 2, 4, 8] as const;

function IconSelect() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M4 2 L4 12.5 L7 9.8 L9.2 13.8 L10.8 13 L8.6 9 L12.5 9 Z" fill="currentColor" />
    </svg>
  );
}
function IconArrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <line x1="3" y1="13" x2="12.5" y2="3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12.5 3.5 L8.5 4.5 L11.5 7.5 Z" fill="currentColor" />
    </svg>
  );
}
function IconRect() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="4" width="12" height="8" rx="0.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}
function IconEllipse() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <ellipse cx="8" cy="8" rx="6" ry="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}
function IconLine() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <line x1="2.5" y1="13.5" x2="13.5" y2="2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconText() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <line x1="2.5" y1="4" x2="13.5" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="8" y1="4" x2="8" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconHighlight() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1.5" y="5" width="13" height="6" rx="1" fill="currentColor" opacity="0.4" />
      <rect x="1.5" y="5" width="13" height="6" rx="1" stroke="currentColor" strokeWidth="1" fill="none" />
      <line x1="1.5" y1="13.5" x2="14.5" y2="13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
function IconBlur() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="1" y="1" width="6" height="6" rx="0.5" fill="currentColor" opacity="0.9" />
      <rect x="9" y="1" width="6" height="6" rx="0.5" fill="currentColor" opacity="0.55" />
      <rect x="1" y="9" width="6" height="6" rx="0.5" fill="currentColor" opacity="0.55" />
      <rect x="9" y="9" width="6" height="6" rx="0.5" fill="currentColor" opacity="0.2" />
    </svg>
  );
}

const TOOL_ICONS: Record<Tool, () => JSX.Element> = {
  select: IconSelect,
  arrow: IconArrow,
  rect: IconRect,
  ellipse: IconEllipse,
  line: IconLine,
  text: IconText,
  highlight: IconHighlight,
  blur: IconBlur,
};

const TOOLS: { id: Tool; label: string }[] = [
  { id: 'select', label: 'Selección' },
  { id: 'arrow', label: 'Flecha' },
  { id: 'rect', label: 'Recuadro' },
  { id: 'ellipse', label: 'Elipse' },
  { id: 'line', label: 'Línea' },
  { id: 'text', label: 'Texto' },
  { id: 'highlight', label: 'Resaltado' },
  { id: 'blur', label: 'Desenfoque' },
];

interface Props {
  tool: Tool;
  color: string;
  strokeWidth: number;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: Dispatch<SetStateAction<Tool>>;
  onColorChange: Dispatch<SetStateAction<string>>;
  onStrokeChange: Dispatch<SetStateAction<number>>;
  onUndo(): void;
  onRedo(): void;
}

export function ScreenshotToolbar({
  tool, color, strokeWidth, canUndo, canRedo,
  onToolChange, onColorChange, onStrokeChange, onUndo, onRedo,
}: Props) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-xl shadow-lg select-none"
      style={{
        background: 'rgba(30,30,30,0.95)',
        border: '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Herramientas */}
      <div className="flex gap-0.5">
        {TOOLS.map((t) => {
          const Icon = TOOL_ICONS[t.id];
          return (
            <button
              key={t.id}
              title={t.label}
              onClick={() => onToolChange(t.id)}
              className="flex items-center justify-center rounded transition-colors"
              style={{
                width: 28,
                height: 28,
                background: tool === t.id ? 'rgba(255,255,255,0.18)' : 'transparent',
                color: tool === t.id ? '#fff' : 'rgba(255,255,255,0.55)',
                border: tool === t.id ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
              }}
            >
              <Icon />
            </button>
          );
        })}
      </div>

      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />

      {/* Paleta de colores */}
      <div className="flex gap-1 items-center">
        {PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => onColorChange(c)}
            title={c}
            style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: c,
              border: color === c ? '2px solid #fff' : '1.5px solid rgba(255,255,255,0.25)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          />
        ))}
        <input
          type="color"
          value={color}
          onChange={(e) => onColorChange(e.target.value)}
          title="Color personalizado"
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            border: '1.5px solid rgba(255,255,255,0.25)',
            cursor: 'pointer',
            padding: 0,
            background: 'transparent',
          }}
        />
      </div>

      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />

      {/* Grosor */}
      <div className="flex gap-0.5 items-center">
        {STROKE_WIDTHS.map((w) => (
          <button
            key={w}
            onClick={() => onStrokeChange(w)}
            title={`${w}px`}
            className="flex items-center justify-center rounded transition-colors"
            style={{
              width: 26,
              height: 28,
              background: strokeWidth === w ? 'rgba(255,255,255,0.18)' : 'transparent',
              color: strokeWidth === w ? '#fff' : 'rgba(255,255,255,0.55)',
              border: strokeWidth === w ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
              fontSize: 11,
            }}
          >
            {w}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.15)' }} />

      {/* Deshacer / Rehacer */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Deshacer (Ctrl+Z)"
        className="flex items-center justify-center rounded transition-colors"
        style={{
          width: 28,
          height: 28,
          color: canUndo ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)',
          background: 'transparent',
          fontSize: 15,
        }}
      >
        ↩
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Rehacer (Ctrl+Y)"
        className="flex items-center justify-center rounded transition-colors"
        style={{
          width: 28,
          height: 28,
          color: canRedo ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)',
          background: 'transparent',
          fontSize: 15,
        }}
      >
        ↪
      </button>
    </div>
  );
}

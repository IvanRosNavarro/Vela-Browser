import { ArrowLeft, ArrowRight, RotateCw, X } from 'lucide-react';
import type { CSSProperties } from 'react';

interface NavButtonsProps {
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  compact: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onStop: () => void;
}

const buttonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--vela-addressbar-fg)',
  border: 'none',
  cursor: 'pointer',
};

export function NavButtons({
  canGoBack,
  canGoForward,
  loading,
  compact,
  onBack,
  onForward,
  onReload,
  onStop,
}: NavButtonsProps) {
  const size = compact ? 22 : 26;
  const icon = compact ? 14 : 16;

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Atrás"
        title="Atrás (Alt+Left)"
        onClick={onBack}
        disabled={!canGoBack}
        style={{
          ...buttonStyle,
          width: size,
          height: size,
          opacity: canGoBack ? 1 : 0.35,
          cursor: canGoBack ? 'pointer' : 'default',
        }}
      >
        <ArrowLeft size={icon} />
      </button>
      <button
        type="button"
        aria-label="Adelante"
        title="Adelante (Alt+Right)"
        onClick={onForward}
        disabled={!canGoForward}
        style={{
          ...buttonStyle,
          width: size,
          height: size,
          opacity: canGoForward ? 1 : 0.35,
          cursor: canGoForward ? 'pointer' : 'default',
        }}
      >
        <ArrowRight size={icon} />
      </button>
      {loading ? (
        <button
          type="button"
          aria-label="Detener"
          title="Detener (Esc)"
          onClick={onStop}
          style={{ ...buttonStyle, width: size, height: size }}
        >
          <X size={icon} />
        </button>
      ) : (
        <button
          type="button"
          aria-label="Recargar"
          title="Recargar (F5 / Ctrl+R)"
          onClick={onReload}
          style={{ ...buttonStyle, width: size, height: size }}
        >
          <RotateCw size={icon} />
        </button>
      )}
    </div>
  );
}

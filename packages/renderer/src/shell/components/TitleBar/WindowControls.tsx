import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { IPC_EVENTS } from '@vela/shared';
import { call } from '../../../lib/ipc';
import { useRuntimeStore } from '../../../stores/runtimeStore';

const PLATFORM = window.api.platform;

// PASO 3: En Windows el titleBarOverlay nativo ocupa exactamente 138px a
// escala 100 % (3 botones × 46px). El ancho de los botones es fijo y no
// cambia al reducir el height. Windows escala automáticamente en 125/150 %.
// El spacer reserva ese espacio para que no quede ningún elemento de React
// sobre la zona de botones nativos (garantiza Snap layouts en Win 11).
function Win32Spacer() {
  return <div style={{ width: 138, flexShrink: 0 }} aria-hidden />;
}

// ── Iconos SVG para los botones circulares de Linux ──────────────────────────

function MinimizeIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
      <rect x="0" y="3.5" width="8" height="1" fill="currentColor" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="7" height="7" stroke="currentColor" fill="none" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
      <rect x="2" y="0" width="6" height="6" stroke="currentColor" fill="none" />
      <rect x="0" y="2" width="6" height="6" stroke="currentColor" fill="none" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
      <line x1="0.5" y1="0.5" x2="7.5" y2="7.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="7.5" y1="0.5" x2="0.5" y2="7.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

// ── Hook de estado maximizado ────────────────────────────────────────────────

function useWindowMaximized(): boolean {
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await call(() => window.api.window.isMaximized());
        if (!cancelled) setMaximized(res.maximized);
      } catch {
        // default false
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const off = window.api.on(IPC_EVENTS.WINDOW_MAXIMIZED_CHANGED, (payload) => {
      if (currentWindowId !== null && payload.windowId !== currentWindowId) return;
      setMaximized(payload.maximized);
    });
    return off;
  }, [currentWindowId]);

  return maximized;
}

// ── Botones de Linux ─────────────────────────────────────────────────────────

// Diseño: círculo neutro de 14px con área de clic de 32px.
// El botón de cierre pasa a rojo al hacer hover.

const HIT = 32;   // px — área interactiva
const CIRC = 14;  // px — diámetro del círculo visible

const circleBase: CSSProperties = {
  width: CIRC,
  height: CIRC,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  transition: 'background 80ms',
};

const circleDefault = '#4a4d55';
const circleHoverMin = '#5a5e68';
const circleHoverMax = '#5a5e68';
const circleHoverClose = '#c42b1c';
const circleActiveClose = '#9f2112';

function LinuxButton({
  label,
  hoverBg,
  activeBg = hoverBg,
  onClick,
  children,
}: {
  label: string;
  hoverBg: string;
  activeBg?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const [bg, setBg] = useState(circleDefault);
  const [color, setColor] = useState('var(--vela-titlebar-fg)');

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  const isClose = hoverBg === circleHoverClose;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      tabIndex={0}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: HIT,
        height: HIT,
        border: 'none',
        background: 'transparent',
        cursor: 'default',
        flexShrink: 0,
        WebkitAppRegion: 'no-drag',
        padding: 0,
        outline: 'none',
      } as CSSProperties}
      onMouseEnter={() => { setBg(hoverBg); if (isClose) setColor('#fff'); }}
      onMouseLeave={() => { setBg(circleDefault); setColor('var(--vela-titlebar-fg)'); }}
      onMouseDown={() => setBg(activeBg)}
      onMouseUp={() => setBg(hoverBg)}
      onFocus={(e) => { (e.currentTarget as HTMLButtonElement).style.outline = '2px solid var(--vela-accent)'; (e.currentTarget as HTMLButtonElement).style.outlineOffset = '1px'; }}
      onBlur={(e) => { (e.currentTarget as HTMLButtonElement).style.outline = 'none'; }}
      onKeyDown={handleKeyDown}
      onClick={onClick}
    >
      <div style={{ ...circleBase, background: bg, color }}>
        {children}
      </div>
    </button>
  );
}

function LinuxControls() {
  const maximized = useWindowMaximized();

  return (
    <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', paddingRight: 4 }}>
      <LinuxButton
        label="Minimizar"
        hoverBg={circleHoverMin}
        onClick={() => void call(() => window.api.window.minimize())}
      >
        <MinimizeIcon />
      </LinuxButton>
      <LinuxButton
        label={maximized ? 'Restaurar' : 'Maximizar'}
        hoverBg={circleHoverMax}
        onClick={() => void call(() => window.api.window.toggleMaximize())}
      >
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </LinuxButton>
      <LinuxButton
        label="Cerrar"
        hoverBg={circleHoverClose}
        activeBg={circleActiveClose}
        onClick={() => void call(() => window.api.window.close())}
      >
        <CloseIcon />
      </LinuxButton>
    </div>
  );
}

// ── Exportación ──────────────────────────────────────────────────────────────

export function WindowControls() {
  if (PLATFORM === 'darwin') return null;
  if (PLATFORM === 'win32') return <Win32Spacer />;
  return <LinuxControls />;
}

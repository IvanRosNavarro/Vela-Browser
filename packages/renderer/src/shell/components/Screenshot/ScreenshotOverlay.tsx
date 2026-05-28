import { useCallback, useEffect, useRef, useState } from 'react';
import { useScreenshotStore } from '../../../stores/screenshotStore';
import { useScreenshot } from './useScreenshot';
import { useOverlay } from '../../../lib/useOverlay';
import { ScreenshotEditor } from './ScreenshotEditor';
import { useUiStore, SIDEBAR_WIDTH_COMPACT } from '../../../stores/uiStore';
import { useDeviceEmulationStore, DEVICE_TOOLBAR_HEIGHT } from '../../../stores/deviceEmulationStore';

const TITLEBAR_HEIGHT = 32;

interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface DragState {
  startX: number;
  startY: number;
  active: boolean;
}

export function ScreenshotOverlay() {
  const phase = useScreenshotStore((s) => s.phase);
  const dropdownOpen = useScreenshotStore((s) => s.dropdownOpen);
  const dataUrl = useScreenshotStore((s) => s.capturedDataUrl);
  const { captureVisible, captureRegion, captureFullPage, close } = useScreenshot();

  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarMode = useUiStore((s) => s.sidebarMode);
  const sidebarWidthNormal = useUiStore((s) => s.sidebarWidthNormal);
  const deviceActive = useDeviceEmulationStore((s) => s.active);

  const sidebarW = !sidebarOpen ? 0 : sidebarMode === 'compact' ? SIDEBAR_WIDTH_COMPACT : sidebarWidthNormal;
  const addrH = TITLEBAR_HEIGHT + (deviceActive ? DEVICE_TOOLBAR_HEIGHT : 0);

  // El WCV queda oculto siempre que haya alguna UI de captura activa,
  // incluido el dropdown del botón cámara.
  useOverlay(phase !== 'idle' || dropdownOpen);

  const [drag, setDrag] = useState<DragState>({ startX: 0, startY: 0, active: false });
  const [selRect, setSelRect] = useState<SelectionRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Auto-focus el overlay para que Esc funcione aunque el WCV tuviera el foco antes.
  useEffect(() => {
    if (phase === 'idle') return;
    const el = overlayRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => el.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (phase !== 'region-select') return;
      e.preventDefault();
      setDrag({ startX: e.clientX, startY: e.clientY, active: true });
      setSelRect(null);
    },
    [phase],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!drag.active) return;
      const left = Math.min(drag.startX, e.clientX);
      const top = Math.min(drag.startY, e.clientY);
      const width = Math.abs(e.clientX - drag.startX);
      const height = Math.abs(e.clientY - drag.startY);
      setSelRect({ left, top, width, height });
    },
    [drag],
  );

  const onMouseUp = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      if (!drag.active) return;
      e.preventDefault();
      setDrag((d) => ({ ...d, active: false }));

      const rawX = Math.min(drag.startX, e.clientX);
      const rawY = Math.min(drag.startY, e.clientY);
      const rawW = Math.abs(e.clientX - drag.startX);
      const rawH = Math.abs(e.clientY - drag.startY);
      setSelRect(null);
      if (rawW < 4 || rawH < 4) { close(); return; }

      await captureRegion({
        x: Math.max(0, rawX - sidebarW),
        y: Math.max(0, rawY - addrH),
        width: rawW,
        height: rawH,
      });
    },
    [drag, captureRegion, close, sidebarW, addrH],
  );

  if (phase === 'idle') return null;

  if (phase === 'editor' && dataUrl) {
    return <ScreenshotEditor dataUrl={dataUrl} onClose={close} />;
  }

  if (phase === 'capturing') {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.55)' }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 16,
            padding: '28px 40px',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          {/* Spinner */}
          <svg
            width={36}
            height={36}
            viewBox="0 0 36 36"
            style={{ animation: 'vela-spin 0.9s linear infinite', flexShrink: 0 }}
            aria-hidden
          >
            <circle
              cx={18} cy={18} r={15}
              fill="none"
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={3}
            />
            <circle
              cx={18} cy={18} r={15}
              fill="none"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray="30 65"
            />
          </svg>
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: 500 }}>
            Capturando página completa…
          </span>
          <style>{`@keyframes vela-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  const overlayAlpha = phase === 'region-select' ? '0.35' : '0.55';

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center outline-none"
      style={{
        background: `rgba(0,0,0,${overlayAlpha})`,
        cursor: phase === 'region-select' ? 'crosshair' : 'default',
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } }}
    >
      {phase === 'mode-select' && (
        <div
          className="flex flex-col items-center gap-6"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Capturar pantalla
          </p>
          <div className="flex gap-4">
            {[
              { label: 'Visible', desc: 'Lo que se ve ahora', action: captureVisible },
              {
                label: 'Selección',
                desc: 'Arrastra para seleccionar',
                action: () => useScreenshotStore.getState().setRegionSelect(),
              },
              { label: 'Página completa', desc: 'Todo el documento', action: captureFullPage },
            ].map(({ label, desc, action }) => (
              <button
                key={label}
                onClick={action}
                className="flex flex-col items-center gap-2 rounded-xl px-6 py-5 transition-colors"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  minWidth: 130,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{desc}</span>
              </button>
            ))}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>Esc para cancelar</p>
        </div>
      )}

      {phase === 'region-select' && (
        <>
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              color: 'rgba(255,255,255,0.85)',
              fontSize: 12,
              pointerEvents: 'none',
              userSelect: 'none',
              background: 'rgba(0,0,0,0.65)',
              padding: '4px 14px',
              borderRadius: 20,
            }}
          >
            Arrastra para seleccionar — Esc para cancelar
          </div>

          {selRect && selRect.width > 1 && selRect.height > 1 && (
            <>
              {/* El box-shadow crea el efecto de "recorte iluminado" sobre el fondo oscuro */}
              <div
                style={{
                  position: 'fixed',
                  left: selRect.left,
                  top: selRect.top,
                  width: selRect.width,
                  height: selRect.height,
                  border: '2px dashed rgba(255,255,255,0.9)',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.3)',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  position: 'fixed',
                  left: selRect.left + selRect.width / 2,
                  top: selRect.top + selRect.height + 6,
                  transform: 'translateX(-50%)',
                  color: 'rgba(255,255,255,0.95)',
                  fontSize: 11,
                  background: 'rgba(0,0,0,0.75)',
                  padding: '2px 10px',
                  borderRadius: 8,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              >
                {Math.round(selRect.width)} × {Math.round(selRect.height)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useScreenshotStore } from '../../stores/screenshotStore';
import { useScreenshot } from '../../shell/components/Screenshot/useScreenshot';

function CameraIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M5.5 2.5 L6.5 1 H9.5 L10.5 2.5 H13.5 C14.05 2.5 14.5 2.95 14.5 3.5 V12 C14.5 12.55 14.05 13 13.5 13 H2.5 C1.95 13 1.5 12.55 1.5 12 V3.5 C1.5 2.95 1.95 2.5 2.5 2.5 Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

interface DropdownPos {
  top: number;
  left: number;
}

const ACTIONS = [
  { id: 'visible', label: 'Capturar área visible' },
  { id: 'region', label: 'Seleccionar región' },
  { id: 'full-page', label: 'Capturar página completa' },
] as const;

type ActionId = (typeof ACTIONS)[number]['id'];

interface Props {
  /** La URL activa — ocultamos el botón en páginas internas sin sentido capturar */
  url: string;
  editing: boolean;
}

export function ScreenshotButton({ url, editing }: Props) {
  const [pos, setPos] = useState<DropdownPos>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownOpen = useScreenshotStore((s) => s.dropdownOpen);
  const { captureVisible, captureRegion: _captureRegion, captureFullPage } = useScreenshot();

  const openDropdown = useCallback(async () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left });
    // Capture before hiding WCV so the frozen page shows as background.
    const res = await window.api.screenshot.captureVisible();
    const snapshot = res.ok ? res.data.dataUrl : undefined;
    useScreenshotStore.getState().openDropdown(snapshot);
  }, []);

  const closeDropdown = useCallback(() => {
    useScreenshotStore.getState().closeDropdown();
  }, []);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!dropdownOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (
        dropdownRef.current && dropdownRef.current.contains(e.target as Node)
      ) return;
      if (btnRef.current && btnRef.current.contains(e.target as Node)) return;
      closeDropdown();
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [dropdownOpen, closeDropdown]);

  // Esc cierra
  useEffect(() => {
    if (!dropdownOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeDropdown(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dropdownOpen, closeDropdown]);

  const handleAction = useCallback(
    async (id: ActionId) => {
      if (id === 'region') {
        // Atomic: close dropdown + enter region-select in one Zustand update
        // so the overlay never releases between the two transitions.
        useScreenshotStore.getState().setRegionSelect();
      } else if (id === 'visible') {
        closeDropdown();
        await captureVisible();
      } else {
        // full-page: enter 'capturing' phase WITHOUT releasing the overlay.
        // If we called closeDropdown() here the async useEffect would fire
        // setOverlay(false) mid-capture, making the WCV briefly visible and
        // triggering a GPU compositor stall (Alt+Tab symptom).
        useScreenshotStore.getState().startCapturing();
        await captureFullPage();
      }
    },
    [closeDropdown, captureVisible, captureFullPage],
  );

  // Ocultar en páginas internas vela:// salvo las que tienen contenido web
  const isInternal = url.startsWith('vela://') || !url || url === 'about:blank';
  if (editing || isInternal) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title="Capturar pantalla (Ctrl+Shift+S)"
        onClick={dropdownOpen ? closeDropdown : () => void openDropdown()}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 20,
          height: 20,
          border: 'none',
          borderRadius: 4,
          background: dropdownOpen ? 'var(--vela-bg-row-hover)' : 'transparent',
          cursor: 'pointer',
          color: dropdownOpen ? 'var(--vela-accent)' : 'var(--vela-addressbar-fg-muted)',
          padding: 0,
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!dropdownOpen) (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-bg-row-hover)';
        }}
        onMouseLeave={(e) => {
          if (!dropdownOpen) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        }}
      >
        <CameraIcon size={14} />
      </button>

      {dropdownOpen &&
        ReactDOM.createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              zIndex: 9999,
              minWidth: 210,
              borderRadius: 10,
              overflow: 'hidden',
              background: 'var(--vela-bg-panel, rgba(28,28,32,0.98))',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {ACTIONS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => void handleAction(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '9px 14px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--vela-fg, rgba(255,255,255,0.9))',
                  fontSize: 13,
                  textAlign: 'left',
                  cursor: 'pointer',
                  gap: 10,
                  borderBottom: id !== 'full-page' ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <CameraIcon size={12} />
                {label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

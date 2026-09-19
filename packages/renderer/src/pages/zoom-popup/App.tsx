import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { IPC_EVENTS } from '@vela/shared';
import { getGlassStyle } from '../../lib/popupGlass';

const params = new URLSearchParams(window.location.search);
const tabId = params.get('tabId') ?? '';
const initialFactor = Number(params.get('factor') ?? '1') || 1;

const MIN_FACTOR = 0.25;
const MAX_FACTOR = 5;

const stepBtn: CSSProperties = {
  width: 26,
  height: 26,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--vela-border, rgba(255,255,255,0.09))',
  borderRadius: 6,
  background: 'transparent',
  color: 'var(--vela-fg, #e6e8ee)',
  padding: 0,
  flexShrink: 0,
};

function hover(e: React.MouseEvent<HTMLButtonElement>, on: boolean): void {
  if (e.currentTarget.disabled) return;
  e.currentTarget.style.background = on ? 'var(--vela-hover, rgba(255,255,255,0.06))' : 'transparent';
}

/**
 * Popup nativo del indicador de zoom: −, porcentaje, + y Restablecer. Actúa
 * sobre la pestaña con la que se abrió y se actualiza con cada
 * `state:tab-zoom-changed` de esa pestaña. Se cierra por blur (main).
 */
export function App() {
  const [factor, setFactor] = useState(initialFactor);

  useEffect(() => {
    if (!tabId) return;
    void window.api.zoom.get({ tabId }).then((res) => {
      if (res.ok) setFactor(res.data.factor);
    });
    return window.api.on(IPC_EVENTS.TAB_ZOOM_CHANGED, (payload) => {
      if (payload.tabId === tabId) setFactor(payload.factor);
    });
  }, []);

  const step = useCallback((direction: 'in' | 'out') => {
    if (!tabId) return;
    void window.api.zoom.step({ tabId, direction }).then((res) => {
      if (res.ok) setFactor(res.data.factor);
    });
  }, []);

  const reset = useCallback(() => {
    if (!tabId) return;
    void window.api.zoom.reset({ tabId }).then((res) => {
      if (res.ok) setFactor(res.data.factor);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.close();
      else if (e.key === '+' || e.key === '=') step('in');
      else if (e.key === '-') step('out');
      else if (e.key === '0') reset();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, reset]);

  const percent = Math.round(factor * 100);
  const atMin = factor <= MIN_FACTOR + 0.001;
  const atMax = factor >= MAX_FACTOR - 0.001;
  const isDefault = Math.abs(factor - 1) < 0.001;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: '100%',
        padding: '0 10px',
        background: 'var(--vela-bg-surface, #1c1f26)',
        border: '1px solid var(--vela-border, rgba(255,255,255,0.09))',
        borderRadius: 8,
        color: 'var(--vela-fg, #e6e8ee)',
        fontSize: 12,
        ...getGlassStyle(),
      }}
    >
      <button
        type="button"
        title="Alejar (Ctrl+-)"
        aria-label="Alejar"
        disabled={atMin}
        onClick={() => step('out')}
        onMouseEnter={(e) => hover(e, true)}
        onMouseLeave={(e) => hover(e, false)}
        style={{ ...stepBtn, opacity: atMin ? 0.35 : 1 }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <span
        aria-live="polite"
        style={{
          minWidth: 46,
          textAlign: 'center',
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {percent} %
      </span>

      <button
        type="button"
        title="Acercar (Ctrl+=)"
        aria-label="Acercar"
        disabled={atMax}
        onClick={() => step('in')}
        onMouseEnter={(e) => hover(e, true)}
        onMouseLeave={(e) => hover(e, false)}
        style={{ ...stepBtn, opacity: atMax ? 0.35 : 1 }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <button
        type="button"
        title="Restablecer (Ctrl+0)"
        disabled={isDefault}
        onClick={reset}
        onMouseEnter={(e) => hover(e, true)}
        onMouseLeave={(e) => hover(e, false)}
        style={{
          marginLeft: 'auto',
          height: 26,
          padding: '0 10px',
          border: '1px solid var(--vela-border, rgba(255,255,255,0.09))',
          borderRadius: 6,
          background: 'transparent',
          color: isDefault ? 'var(--vela-fg-muted, #8c93a3)' : 'var(--vela-accent, #5b8ef4)',
          fontSize: 12,
          fontWeight: 500,
          whiteSpace: 'nowrap',
        }}
      >
        Restablecer
      </button>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { IPC_EVENTS, type AutofillPopupOptions, type CardBrand } from '@vela/shared';
import { getGlassStyle } from '../../lib/popupGlass';

// Popup de relleno de direcciones y tarjetas, anclado bajo el campo enfocado.
// No toma el foco (la ventana no es enfocable): el usuario sigue en el campo,
// y las flechas y el Enter llegan reenviados desde la pestaña.
// Las alturas cuadran con las constantes de main (ipc/autofill.ts).
const HEADER_HEIGHT = 34;
const ROW_HEIGHT = 44;
const FOOTER_HEIGHT = 32;

const params = new URLSearchParams(window.location.search);
const token = params.get('token') ?? '';

const BRAND_BADGE: Record<CardBrand, string> = {
  visa: 'VISA',
  mastercard: 'MC',
  amex: 'AMEX',
  discover: 'DISC',
  diners: 'DC',
  jcb: 'JCB',
  unionpay: 'UP',
  maestro: 'MAES',
  unknown: '••••',
};

export function App() {
  const [data, setData] = useState<AutofillPopupOptions | null>(null);
  const [selected, setSelected] = useState(-1);
  const [filling, setFilling] = useState(false);
  const selectedRef = useRef(-1);
  selectedRef.current = selected;

  useEffect(() => {
    void window.api.autofill.popupGetOptions({ token }).then((res) => {
      if (res.ok && res.data) setData(res.data);
      else void window.api.autofill.popupClose({ token });
    });
  }, []);

  const fill = useCallback(async (id: string) => {
    setFilling(true);
    await window.api.autofill.popupFill({ token, id });
  }, []);

  useEffect(() => {
    const count = data?.options.length ?? 0;
    return window.api.on(IPC_EVENTS.AUTOFILL_POPUP_KEY_PRESSED, ({ key }) => {
      if (count === 0) return;
      if (key === 'ArrowDown') setSelected((i) => (i + 1) % count);
      else if (key === 'ArrowUp') setSelected((i) => (i <= 0 ? count - 1 : i - 1));
      else if (key === 'Enter') {
        const opt = data?.options[selectedRef.current];
        if (opt) void fill(opt.id);
      }
    });
  }, [data, fill]);

  useEffect(() => {
    if (selected < 0) return;
    document.getElementById(`autofill-opt-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!data) {
    return <div style={{ height: '100%', background: 'var(--vela-bg-surface)', borderRadius: 'var(--vela-radius)' }} />;
  }

  const isCard = data.kind === 'card';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--vela-bg-surface)',
      borderRadius: 'var(--vela-radius)',
      border: '1px solid var(--vela-border)',
      overflow: 'hidden',
      ...getGlassStyle(),
    }}>
      <div style={{
        height: HEADER_HEIGHT,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 12px',
        borderBottom: '1px solid var(--vela-border)',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--vela-fg)',
      }}>
        <span>{isCard ? '💳 Tarjetas guardadas' : '📍 Direcciones guardadas'}</span>
        <span style={{ fontWeight: 400, color: 'var(--vela-fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          · {data.host}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {data.options.map((opt, i) => (
          <button
            key={opt.id}
            id={`autofill-opt-${i}`}
            type="button"
            disabled={filling}
            onClick={() => void fill(opt.id)}
            onMouseEnter={() => setSelected(i)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              height: ROW_HEIGHT,
              padding: '0 12px',
              border: 'none',
              borderBottom: '1px solid var(--vela-border)',
              background: i === selected ? 'var(--vela-hover)' : 'transparent',
              color: 'var(--vela-fg)',
              textAlign: 'left',
              cursor: filling ? 'default' : 'pointer',
            }}
          >
            {isCard && (
              <span style={{
                flexShrink: 0,
                width: 38,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.03em',
                textAlign: 'center',
                padding: '3px 0',
                borderRadius: 4,
                border: '1px solid var(--vela-border)',
                color: 'var(--vela-fg-muted)',
              }}>
                {BRAND_BADGE[opt.brand ?? 'unknown']}
              </span>
            )}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {opt.title}
              </span>
              {opt.subtitle && (
                <span style={{ display: 'block', fontSize: 10, color: 'var(--vela-fg-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {opt.subtitle}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      <div style={{ height: FOOTER_HEIGHT, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid var(--vela-border)' }}>
        <button
          type="button"
          onClick={() => void window.api.autofill.openManager({ view: isCard ? 'cards' : 'addresses', token })}
          style={{ background: 'none', border: 'none', color: 'var(--vela-accent)', fontSize: 11, cursor: 'pointer' }}
        >
          {isCard ? 'Gestionar tarjetas →' : 'Gestionar direcciones →'}
        </button>
      </div>
    </div>
  );
}

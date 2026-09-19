import { useCallback, useEffect, useState } from 'react';
import type { AutofillSaveOffer } from '@vela/shared';
import { getGlassStyle } from '../../lib/popupGlass';

// Oferta de guardar una dirección o tarjeta recién enviada en un formulario.
// Solo recibe una vista previa (la tarjeta enmascarada); los datos completos
// se quedan en main hasta que el usuario decide.
const params = new URLSearchParams(window.location.search);
const token = params.get('token') ?? '';

export function App() {
  const [offer, setOffer] = useState<AutofillSaveOffer | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.api.autofill.saveOfferGet({ token }).then((res) => {
      if (res.ok && res.data) setOffer(res.data);
      else window.close();
    });
  }, []);

  const decide = useCallback(async (save: boolean) => {
    setBusy(true);
    await window.api.autofill.saveOfferDecide({ token, save });
  }, []);

  if (!offer) {
    return <div style={{ height: '100%', background: 'var(--vela-bg-surface)', borderRadius: 'var(--vela-radius)' }} />;
  }

  const isCard = offer.kind === 'card';
  const heading = isCard
    ? (offer.isUpdate ? 'Actualizar tarjeta' : 'Guardar tarjeta')
    : 'Guardar dirección';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--vela-bg-surface)',
      borderRadius: 'var(--vela-radius)',
      border: '1px solid var(--vela-border)',
      padding: '12px 14px',
      gap: 10,
      ...getGlassStyle(),
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>{isCard ? '💳' : '📍'}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--vela-fg)', flexShrink: 0 }}>{heading}</span>
        <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {offer.host}
        </span>
      </div>

      <div style={{
        padding: '8px 10px',
        borderRadius: 6,
        border: '1px solid var(--vela-border)',
        background: 'var(--vela-bg)',
        minWidth: 0,
      }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--vela-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {offer.title}
        </div>
        {offer.subtitle && (
          <div style={{ fontSize: 11, color: 'var(--vela-fg-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {offer.subtitle}
          </div>
        )}
      </div>

      <p style={{ fontSize: 10, color: 'var(--vela-fg-muted)', margin: 0 }}>
        {isCard
          ? 'Se guarda cifrada en el gestor de contraseñas. El código de seguridad (CVV) no se guarda.'
          : 'Se guarda cifrada en el gestor de contraseñas para rellenar formularios.'}
      </p>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 'auto' }}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); }}
          onClick={() => void decide(false)}
          disabled={busy}
          style={btnSecondaryStyle}
        >
          No guardar
        </button>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); }}
          onClick={() => void decide(true)}
          disabled={busy}
          style={btnPrimaryStyle}
        >
          {offer.isUpdate ? 'Actualizar' : 'Guardar'}
        </button>
      </div>
    </div>
  );
}

const btnSecondaryStyle: React.CSSProperties = {
  background: 'var(--vela-bg)',
  border: '1px solid var(--vela-border)',
  borderRadius: 5,
  color: 'var(--vela-fg-muted)',
  fontSize: 11,
  padding: '4px 10px',
  cursor: 'pointer',
};

const btnPrimaryStyle: React.CSSProperties = {
  background: 'var(--vela-accent)',
  border: 'none',
  borderRadius: 5,
  color: '#fff',
  fontSize: 11,
  padding: '4px 12px',
  cursor: 'pointer',
  fontWeight: 500,
};

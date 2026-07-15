import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ClientCertificateInfo } from '@vela/shared';
import { getGlassStyle } from '../../lib/popupGlass';

const params = new URLSearchParams(window.location.search);
const wcId = parseInt(params.get('wcId') ?? '0', 10);

function formatDate(epochSeconds: number | undefined): string | null {
  if (!epochSeconds) return null;
  try {
    return new Date(epochSeconds * 1000).toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return null;
  }
}

function isExpired(cert: ClientCertificateInfo): boolean {
  return typeof cert.validExpiry === 'number' && cert.validExpiry * 1000 < Date.now();
}

function IdIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M15 8h4M15 12h4M6 16h5" />
    </svg>
  );
}

function CertRow({
  cert,
  selected,
  onSelect,
}: {
  cert: ClientCertificateInfo;
  selected: boolean;
  onSelect: () => void;
}) {
  const expired = isExpired(cert);
  const validTo = formatDate(cert.validExpiry);

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        width: '100%',
        padding: '9px 12px',
        background: selected ? 'var(--vela-selected, rgba(91,142,244,0.18))' : 'none',
        border: '1px solid ' + (selected ? 'var(--vela-accent, #5b8ef4)' : 'transparent'),
        borderRadius: 8,
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <span
        style={{
          marginTop: 2,
          width: 14,
          height: 14,
          borderRadius: '50%',
          border: '1.5px solid ' + (selected ? 'var(--vela-accent, #5b8ef4)' : 'var(--vela-border, rgba(255,255,255,0.3))'),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {selected && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--vela-accent, #5b8ef4)' }} />}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--vela-fg, #e6e8ee)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {cert.subject}
        </span>
        <span style={{ fontSize: 11, color: 'var(--vela-fg-muted, #8c93a3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Emitido por: {cert.issuer}
        </span>
        {validTo && (
          <span style={{ fontSize: 11, color: expired ? 'var(--vela-warning, #f0a500)' : 'var(--vela-fg-muted, #8c93a3)' }}>
            {expired ? 'Caducado el ' : 'Válido hasta '}{validTo}
          </span>
        )}
      </span>
    </button>
  );
}

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hostname, setHostname] = useState('');
  const [certificates, setCertificates] = useState<ClientCertificateInfo[] | null>(null);
  const [selectedFingerprint, setSelectedFingerprint] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await window.api.clientCert.getInitialData({ wcId });
      if (cancelled) return;
      setHostname(data?.hostname ?? '');
      setCertificates(data?.certificates ?? []);
    })();
    return () => { cancelled = true; };
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    window.resizeTo(window.outerWidth, el.scrollHeight);
  });

  const handleCancel = useCallback(() => {
    setSubmitting(true);
    void window.api.clientCert.cancel({ wcId });
  }, []);

  const handleUse = useCallback(() => {
    if (!selectedFingerprint) return;
    setSubmitting(true);
    void window.api.clientCert.select({ wcId, fingerprint: selectedFingerprint, remember });
  }, [selectedFingerprint, remember]);

  const loading = certificates === null;
  const empty = certificates !== null && certificates.length === 0;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--vela-bg-surface, #1c1f26)',
        border: '1px solid var(--vela-border, rgba(255,255,255,0.1))',
        borderRadius: 10,
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        ...getGlassStyle(),
      }}
    >
      <div style={{ padding: '14px 16px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: 'var(--vela-accent, #5b8ef4)', display: 'flex', flexShrink: 0 }}>
            <IdIcon />
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--vela-fg, #e6e8ee)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Seleccionar certificado
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--vela-fg-muted, #8c93a3)', paddingLeft: 22 }}>
          {hostname || 'Este sitio'} solicita un certificado para identificarte
        </p>
      </div>

      <div style={{ padding: '2px 8px 8px', display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
        {loading && (
          <p style={{ margin: '8px 6px', fontSize: 11.5, color: 'var(--vela-fg-muted, #8c93a3)' }}>Cargando certificados…</p>
        )}
        {empty && (
          <p style={{ margin: '8px 6px', fontSize: 11.5, color: 'var(--vela-fg-muted, #8c93a3)' }}>
            No se ha encontrado ningún certificado válido en el almacén de Windows para este sitio.
          </p>
        )}
        {certificates?.map((cert) => (
          <CertRow
            key={cert.fingerprint}
            cert={cert}
            selected={selectedFingerprint === cert.fingerprint}
            onSelect={() => setSelectedFingerprint(cert.fingerprint)}
          />
        ))}
      </div>

      {!empty && !loading && (
        <div style={{ padding: '0 16px 4px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--vela-fg-muted, #8c93a3)', cursor: 'pointer' }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Recordar esta elección para este sitio
          </label>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--vela-border, rgba(255,255,255,0.08))' }}>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            borderRadius: 6,
            border: '1px solid var(--vela-border, rgba(255,255,255,0.15))',
            background: 'none',
            color: 'var(--vela-fg, #e6e8ee)',
            cursor: submitting ? 'default' : 'pointer',
          }}
        >
          Cancelar
        </button>
        {!empty && (
          <button
            type="button"
            onClick={handleUse}
            disabled={submitting || !selectedFingerprint}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 500,
              borderRadius: 6,
              border: 'none',
              background: selectedFingerprint ? 'var(--vela-accent, #5b8ef4)' : 'var(--vela-border, rgba(255,255,255,0.15))',
              color: selectedFingerprint ? 'var(--vela-accent-fg, #ffffff)' : 'var(--vela-fg-muted, #8c93a3)',
              cursor: submitting || !selectedFingerprint ? 'default' : 'pointer',
            }}
          >
            Usar este certificado
          </button>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import type { CertificateInfo } from '@vela/shared';
import { getGlassStyle } from '../../lib/popupGlass';

const params = new URLSearchParams(window.location.search);
const windowId = parseInt(params.get('windowId') ?? '0', 10);
const scheme = params.get('scheme') ?? 'https';
const rawUrl = params.get('rawUrl') ?? '';

export function App() {
  const [showCert, setShowCert] = useState(false);
  const [cert, setCert] = useState<CertificateInfo | null | 'loading' | 'unavailable'>('loading');

  useEffect(() => {
    if (scheme !== 'https' || !showCert) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await window.api.security.getCertificate({ windowId });
        if (!cancelled) setCert(res.ok ? (res.data ?? 'unavailable') : 'unavailable');
      } catch {
        if (!cancelled) setCert('unavailable');
      }
    })();
    return () => { cancelled = true; };
  }, [showCert]);

  const { color, iconPath, title, body } = (() => {
    if (scheme === 'https') return {
      color: 'var(--vela-success, #4caf7d)',
      iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
      title: 'Conexión segura',
      body: 'El certificado es válido y la conexión está cifrada.',
    };
    if (scheme === 'http') return {
      color: 'var(--vela-warning, #f0a500)',
      iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM12 8v4M12 16h.01',
      title: 'Conexión no segura',
      body: 'La información enviada a este sitio puede ser interceptada por terceros.',
    };
    if (scheme === 'file') return {
      color: 'var(--vela-fg-muted)',
      iconPath: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
      title: 'Archivo local',
      body: 'Estás viendo un archivo almacenado en este equipo.',
    };
    if (scheme === 'vela') return {
      color: 'var(--vela-accent)',
      iconPath: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
      title: 'Página interna de Vela',
      body: 'Esta página forma parte de Vela Browser.',
    };
    return {
      color: 'var(--vela-fg-muted)',
      iconPath: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
      title: 'Esquema desconocido',
      body: '',
    };
  })();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--vela-bg-surface)',
      borderRadius: 8,
      border: '1px solid var(--vela-border)',
      overflow: 'hidden',
      padding: '10px 12px',
      fontSize: 12,
      color: 'var(--vela-fg)',
      ...getGlassStyle(),
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={iconPath} />
        </svg>
        <span style={{ fontWeight: 600, color }}>{title}</span>
      </div>

      {/* Body */}
      {body && (
        <p style={{ color: 'var(--vela-fg-muted)', fontSize: 11, marginBottom: 8 }}>{body}</p>
      )}

      {/* Cert toggle for HTTPS */}
      {scheme === 'https' && (
        <>
          <button
            type="button"
            onClick={() => setShowCert((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'transparent',
              border: '1px solid var(--vela-border)',
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: 11,
              color: 'var(--vela-fg)',
              cursor: 'pointer',
              marginBottom: showCert ? 8 : 0,
              alignSelf: 'flex-start',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Ver certificado
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: showCert ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showCert && (
            <div style={{ marginTop: 4 }}>
              {cert === 'loading' ? (
                <p style={{ color: 'var(--vela-fg-muted)', fontSize: 11 }}>Cargando…</p>
              ) : cert === 'unavailable' || cert === null ? (
                <p style={{ color: 'var(--vela-fg-muted)', fontSize: 11 }}>Información no disponible.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', fontSize: 11 }}>
                  <span style={{ color: 'var(--vela-fg-muted)' }}>Sujeto</span>
                  <span style={{ wordBreak: 'break-all' }}>{cert.subject}</span>
                  <span style={{ color: 'var(--vela-fg-muted)' }}>Emisor</span>
                  <span style={{ wordBreak: 'break-all' }}>{cert.issuer}</span>
                  <span style={{ color: 'var(--vela-fg-muted)' }}>Válido desde</span>
                  <span>{cert.validFrom}</span>
                  <span style={{ color: 'var(--vela-fg-muted)' }}>Válido hasta</span>
                  <span>{cert.validTo}</span>
                  <span style={{ color: 'var(--vela-fg-muted)' }}>Huella</span>
                  <span style={{ fontFamily: 'monospace', wordBreak: 'break-all', fontSize: 10 }}>{cert.fingerprint}</span>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* URL footer */}
      <div style={{
        marginTop: 8,
        paddingTop: 8,
        borderTop: '1px solid var(--vela-border)',
        color: 'var(--vela-fg-muted)',
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: 10,
        wordBreak: 'break-all',
      }}>
        {rawUrl || '(sin URL)'}
      </div>
    </div>
  );
}

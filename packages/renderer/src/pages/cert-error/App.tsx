import { useState, useCallback } from 'react';

function getParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? '';
}

function errorLabel(error: string): string {
  const map: Record<string, string> = {
    'net::ERR_CERT_AUTHORITY_INVALID': 'La autoridad de certificación no es de confianza',
    'net::ERR_CERT_COMMON_NAME_INVALID': 'El certificado no coincide con el dominio',
    'net::ERR_CERT_DATE_INVALID': 'El certificado ha caducado o aún no es válido',
    'net::ERR_CERT_REVOKED': 'El certificado ha sido revocado',
    'net::ERR_CERT_WEAK_SIGNATURE_ALGORITHM': 'El certificado usa un algoritmo de firma débil',
    'net::ERR_CERT_INVALID': 'El certificado no es válido',
    'net::ERR_CERTIFICATE_TRANSPARENCY_REQUIRED': 'El certificado no cumple los requisitos de transparencia',
  };
  return map[error] ?? 'El certificado presenta un problema de seguridad';
}

export function App() {
  const url         = getParam('url');
  const fingerprint = getParam('fingerprint');
  const error       = getParam('error');
  const subject     = getParam('subject');
  const issuer      = getParam('issuer');
  const wcId        = getParam('wcId');

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [proceeding,   setProceeding]   = useState(false);

  // Navega a vela://cert-back — el protocolo handler llama a navigationHistory.goBack()
  // o a vela://newtab si no hay historial. No necesita IPC ni preload.
  const handleBack = useCallback(() => {
    window.location.href = `vela://cert-back?wcId=${encodeURIComponent(wcId)}`;
  }, [wcId]);

  // Navega a vela://cert-proceed — el protocolo handler emite el evento que
  // CertificateManager intercepta para añadir la huella y recargar la URL original.
  const handleProceed = useCallback(() => {
    if (!fingerprint || !url || !wcId) return;
    setProceeding(true);
    const params = new URLSearchParams({ fingerprint, url, wcId });
    window.location.href = `vela://cert-proceed?${params.toString()}`;
  }, [fingerprint, url, wcId]);

  let hostname = url;
  try { hostname = new URL(url).hostname; } catch { /* noop */ }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-[var(--vela-bg,#0e0f12)] text-[var(--vela-fg,#e6e8ee)] px-6">
      <div className="flex w-full max-w-lg flex-col gap-6">

        {/* Icono */}
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--vela-danger,#ff8a8a)]/10">
            <svg className="h-10 w-10 text-[var(--vela-danger,#ff8a8a)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
        </div>

        {/* Título */}
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Tu conexión no es privada</h1>
          <p className="mt-2 text-sm text-[var(--vela-fg-muted,#8c93a3)]">
            Los atacantes podrían estar intentando robar tu información de&nbsp;
            <span className="font-medium text-[var(--vela-fg,#e6e8ee)]">{hostname}</span>.
          </p>
        </div>

        {/* Código de error */}
        <div className="rounded-lg border border-[var(--vela-border,rgba(255,255,255,0.08))] bg-[var(--vela-bg-elevated,#1c1f25)] px-4 py-3">
          <p className="text-xs text-[var(--vela-fg-muted,#8c93a3)]">
            {errorLabel(error)}
          </p>
          {error && (
            <p className="mt-1 font-mono text-xs text-[var(--vela-fg-muted,#8c93a3)] opacity-60">{error}</p>
          )}
        </div>

        {/* Botón principal */}
        <button
          onClick={handleBack}
          className="w-full rounded-lg bg-[var(--vela-accent,#7d8cff)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 active:opacity-80"
        >
          Volver a lugar seguro
        </button>

        {/* Avanzado */}
        <div>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-[var(--vela-fg-muted,#8c93a3)] hover:text-[var(--vela-fg,#e6e8ee)] transition-colors"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            Avanzado
          </button>

          {showAdvanced && (
            <div className="mt-3 flex flex-col gap-3">
              {/* Detalles del certificado */}
              <div className="rounded-lg border border-[var(--vela-border,rgba(255,255,255,0.08))] bg-[var(--vela-bg-elevated,#1c1f25)] px-4 py-3 text-xs text-[var(--vela-fg-muted,#8c93a3)] space-y-1">
                {subject && <p><span className="text-[var(--vela-fg,#e6e8ee)]">Emisor para:</span> {subject}</p>}
                {issuer  && <p><span className="text-[var(--vela-fg,#e6e8ee)]">Emitido por:</span> {issuer}</p>}
                <p className="mt-1 font-mono opacity-50 break-all">{fingerprint}</p>
              </div>

              {/* Continuar de todas formas */}
              <button
                onClick={handleProceed}
                disabled={proceeding}
                className="text-left text-sm text-[var(--vela-fg-muted,#8c93a3)] hover:text-[var(--vela-danger,#ff8a8a)] transition-colors disabled:opacity-50"
              >
                {proceeding
                  ? 'Cargando…'
                  : `Continuar a ${hostname} (no seguro)`}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

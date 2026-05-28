import { useAparejosStore } from '../../../stores/aparejosStore';
import type { AparejoId } from '@vela/shared';

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CookieIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="8.5" cy="9" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="14" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1" fill="currentColor" stroke="none" />
      <line x1="12" y1="12" x2="12.5" y2="9.5" />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function AparejoIcon({ id }: { id: AparejoId }) {
  if (id === 'adblocker') return <ShieldIcon />;
  if (id === 'analytics-debugger') return <AnalyticsIcon />;
  return <CookieIcon />;
}

export function Aparejos() {
  const aparejos = useAparejosStore((s) => s.aparejos);
  const loaded = useAparejosStore((s) => s.loaded);
  const setEnabled = useAparejosStore((s) => s.setEnabled);

  if (!loaded) {
    return (
      <p className="text-sm text-[var(--vela-fg-muted)]">Cargando…</p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--vela-fg-muted)]">
        Los Aparejos son extensiones nativas de Vela con motor activo. Izarlos los activa; arriarlos los desactiva completamente.
      </p>

      <div className="space-y-3">
        {aparejos.map((aparejo) => (
          <div
            key={aparejo.id}
            className="flex items-center gap-4 rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] p-4"
          >
            <div
              style={{
                color: aparejo.enabled ? 'var(--vela-accent)' : 'var(--vela-fg-muted)',
                flexShrink: 0,
                transition: 'color 200ms',
              }}
            >
              <AparejoIcon id={aparejo.id} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-[var(--vela-fg)]">
                  {aparejo.name}
                </p>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: aparejo.enabled
                      ? 'color-mix(in srgb, var(--vela-accent) 15%, transparent)'
                      : 'var(--vela-bg-app)',
                    color: aparejo.enabled ? 'var(--vela-accent)' : 'var(--vela-fg-muted)',
                    border: '1px solid',
                    borderColor: aparejo.enabled
                      ? 'color-mix(in srgb, var(--vela-accent) 40%, transparent)'
                      : 'var(--vela-border)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {aparejo.enabled ? 'Izado' : 'Arriado'}
                </span>
              </div>
              <p className="text-xs text-[var(--vela-fg-muted)] mt-0.5">
                {aparejo.description}
              </p>
            </div>

            <button
              onClick={() => void setEnabled(aparejo.id, !aparejo.enabled)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 6,
                border: '1px solid',
                borderColor: aparejo.enabled
                  ? 'color-mix(in srgb, var(--vela-accent) 40%, transparent)'
                  : 'var(--vela-border)',
                background: aparejo.enabled
                  ? 'color-mix(in srgb, var(--vela-accent) 10%, transparent)'
                  : 'var(--vela-bg-app)',
                color: aparejo.enabled ? 'var(--vela-accent)' : 'var(--vela-fg)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 150ms',
              }}
            >
              {aparejo.enabled ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                  Arriar Aparejo
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <polyline points="19 12 12 19 5 12" />
                  </svg>
                  Izar Aparejo
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--vela-fg-muted)]">
        Los cambios se aplican inmediatamente. La configuración se guarda por perfil.
      </p>
    </div>
  );
}

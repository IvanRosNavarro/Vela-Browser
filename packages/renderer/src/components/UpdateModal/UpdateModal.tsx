import { useCallback } from 'react';
import { useUpdateStore } from '../../stores/updateStore';
import { useOverlay } from '../../lib/useOverlay';

export function UpdateModal() {
  const modalOpen = useUpdateStore((s) => s.modalOpen);
  const status = useUpdateStore((s) => s.status);
  const closeModal = useUpdateStore((s) => s.closeModal);

  // Modal a pantalla completa: el WCV se oculta mientras esté abierta.
  useOverlay(modalOpen);

  const handleCheckAgain = useCallback(() => {
    void window.api.update.checkNow();
  }, []);

  const handleDownload = useCallback(() => {
    void window.api.update.download();
  }, []);

  const handleInstall = useCallback(() => {
    closeModal();
    void window.api.update.quitAndInstall();
  }, [closeModal]);

  const handleOpenRelease = useCallback(() => {
    void window.api.update.openRelease();
  }, []);

  if (!modalOpen) return null;

  const { phase, currentVersion, version, percent, error, canInstall } = status;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded-xl border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--vela-fg)]">Actualizaciones</h2>
          <button
            onClick={closeModal}
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--vela-fg-muted)] hover:bg-[var(--vela-border)]/50 hover:text-[var(--vela-fg)] transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {phase === 'unsupported' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--vela-fg-muted)]/15 text-[var(--vela-fg-muted)] text-2xl">
              ⚙
            </div>
            <p className="text-sm font-medium text-[var(--vela-fg)]">Modo de desarrollo</p>
            <p className="max-w-xs text-center text-xs text-[var(--vela-fg-muted)]">
              Las actualizaciones automáticas no están disponibles en modo de desarrollo.
            </p>
            <p className="text-xs text-[var(--vela-fg-muted)]">Versión actual: v{currentVersion}</p>
          </div>
        )}

        {(phase === 'idle' || phase === 'checking') && (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--vela-accent)] border-t-transparent" />
            <p className="text-sm text-[var(--vela-fg-muted)]">Buscando actualizaciones…</p>
          </div>
        )}

        {phase === 'up-to-date' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15 text-green-400 text-2xl">
              ✓
            </div>
            <p className="text-sm font-medium text-[var(--vela-fg)]">Vela está al día</p>
            <p className="text-xs text-[var(--vela-fg-muted)]">Versión actual: v{currentVersion}</p>
            <button
              onClick={handleCheckAgain}
              className="mt-3 rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-app)] px-4 py-1.5 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50 transition-colors"
            >
              Comprobar de nuevo
            </button>
          </div>
        )}

        {phase === 'available' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--vela-accent)]/15 text-[var(--vela-accent)] text-2xl">
              ↓
            </div>
            <p className="text-sm font-medium text-[var(--vela-fg)]">Nueva versión disponible</p>
            <p className="text-xs text-[var(--vela-fg-muted)]">v{version}</p>
            {canInstall ? (
              <button
                onClick={handleDownload}
                className="mt-3 rounded-md bg-[var(--vela-accent)] px-5 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
              >
                Descargar e instalar
              </button>
            ) : (
              <>
                <p className="max-w-xs text-center text-xs text-[var(--vela-fg-muted)]">
                  En macOS la actualización automática no está disponible todavía. Descarga la
                  versión nueva desde la página de la release.
                </p>
                <button
                  onClick={handleOpenRelease}
                  className="mt-3 rounded-md bg-[var(--vela-accent)] px-5 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                >
                  Abrir página de descarga ↗
                </button>
              </>
            )}
          </div>
        )}

        {phase === 'downloading' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <p className="text-sm font-medium text-[var(--vela-fg)]">Descargando…</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--vela-border)]">
              <div
                className="h-full rounded-full bg-[var(--vela-accent)] transition-[width] duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-xs text-[var(--vela-fg-muted)]">{percent}%</p>
          </div>
        )}

        {phase === 'downloaded' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15 text-green-400 text-2xl">
              ✓
            </div>
            <p className="text-sm font-medium text-[var(--vela-fg)]">Lista para instalar</p>
            <p className="text-xs text-[var(--vela-fg-muted)]">v{version}</p>
            <p className="max-w-xs text-center text-xs text-[var(--vela-fg-muted)]">
              También se instalará sola la próxima vez que cierres Vela.
            </p>
            <button
              onClick={handleInstall}
              className="mt-3 rounded-md bg-[var(--vela-accent)] px-5 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              Reiniciar e instalar
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-400 text-2xl">
              !
            </div>
            <p className="text-sm font-medium text-[var(--vela-fg)]">No se pudo actualizar</p>
            {error && (
              <p className="max-w-xs text-center text-xs text-[var(--vela-fg-muted)]">{error}</p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleCheckAgain}
                className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-app)] px-4 py-1.5 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50 transition-colors"
              >
                Reintentar
              </button>
              <button
                onClick={handleOpenRelease}
                className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-app)] px-4 py-1.5 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50 transition-colors"
              >
                Descargar a mano ↗
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

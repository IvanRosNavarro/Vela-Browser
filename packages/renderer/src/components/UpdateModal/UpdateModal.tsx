import { useCallback } from 'react';
import { useUpdateStore } from '../../stores/updateStore';
import { useOverlay } from '../../lib/useOverlay';

declare const __APP_VERSION__: string;

export function UpdateModal() {
  const modalOpen = useUpdateStore((s) => s.modalOpen);
  const phase = useUpdateStore((s) => s.phase);
  const availableVersion = useUpdateStore((s) => s.availableVersion);
  const downloadPercent = useUpdateStore((s) => s.downloadPercent);
  const errorMessage = useUpdateStore((s) => s.errorMessage);
  const closeModal = useUpdateStore((s) => s.closeModal);
  const setPhase = useUpdateStore((s) => s.setPhase);

  useOverlay(modalOpen);

  const handleCheckAgain = useCallback(async () => {
    setPhase('checking');
    try {
      const res = await window.api.update.checkNow();
      if (!res.ok) setPhase('error', { message: 'Error al comprobar actualizaciones.' });
    } catch {
      setPhase('error', { message: 'Error al comprobar actualizaciones.' });
    }
  }, [setPhase]);

  const handleDownload = useCallback(() => {
    setPhase('downloading');
    void window.api.update.download();
  }, [setPhase]);

  const handleInstall = useCallback(() => {
    closeModal();
    void window.api.update.quitAndInstall();
  }, [closeModal]);

  if (!modalOpen) return null;

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

        {phase === 'dev-mode' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--vela-fg-muted)]/15 text-[var(--vela-fg-muted)] text-2xl">
              ⚙
            </div>
            <p className="text-sm font-medium text-[var(--vela-fg)]">Modo de desarrollo</p>
            <p className="max-w-xs text-center text-xs text-[var(--vela-fg-muted)]">
              Las actualizaciones automáticas no están disponibles en modo de desarrollo.
            </p>
            <p className="text-xs text-[var(--vela-fg-muted)]">Versión actual: v{__APP_VERSION__}</p>
          </div>
        )}

        {phase === 'checking' && (
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
            <p className="text-xs text-[var(--vela-fg-muted)]">Versión actual: v{__APP_VERSION__}</p>
            <button
              onClick={() => void handleCheckAgain()}
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
            <p className="text-xs text-[var(--vela-fg-muted)]">v{availableVersion}</p>
            <button
              onClick={handleDownload}
              className="mt-3 rounded-md bg-[var(--vela-accent)] px-5 py-1.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
            >
              Descargar e instalar
            </button>
          </div>
        )}

        {phase === 'downloading' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <p className="text-sm font-medium text-[var(--vela-fg)]">Descargando…</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--vela-border)]">
              <div
                className="h-full rounded-full bg-[var(--vela-accent)] transition-[width] duration-300"
                style={{ width: `${downloadPercent}%` }}
              />
            </div>
            <p className="text-xs text-[var(--vela-fg-muted)]">{downloadPercent}%</p>
          </div>
        )}

        {phase === 'downloaded' && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/15 text-green-400 text-2xl">
              ✓
            </div>
            <p className="text-sm font-medium text-[var(--vela-fg)]">Lista para instalar</p>
            <p className="text-xs text-[var(--vela-fg-muted)]">v{availableVersion}</p>
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
            <p className="text-sm font-medium text-[var(--vela-fg)]">Error al comprobar</p>
            {errorMessage && (
              <p className="max-w-xs text-center text-xs text-[var(--vela-fg-muted)]">{errorMessage}</p>
            )}
            <button
              onClick={() => void handleCheckAgain()}
              className="mt-3 rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-app)] px-4 py-1.5 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50 transition-colors"
            >
              Reintentar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import type { Profile } from '@vela/shared';

export interface DeleteProfileDialogProps {
  profile: Profile;
  /**
   * Cuántas ventanas tiene abiertas el perfil ahora mismo. Si > 0
   * bloqueamos el borrado: las pestañas vivas escriben en la BD del
   * perfil, eliminarla en caliente generaría writes huérfanos.
   */
  openWindowCount: number;
  /**
   * Conteos resumidos para el copy. En esta fase los rellena la pantalla
   * de gestión cuando los conoce; si no, los pasamos como `null` y el
   * texto se simplifica.
   */
  workspaceCount: number | null;
  savedTabCount: number | null;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}

export function DeleteProfileDialog({
  profile,
  openWindowCount,
  workspaceCount,
  savedTabCount,
  onCancel,
  onConfirm,
}: DeleteProfileDialogProps) {
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blockedByOpenWindows = openWindowCount > 0;
  const matches = typed === profile.name;

  const handleConfirm = async (): Promise<void> => {
    if (!matches || blockedByOpenWindows || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
    >
      <div
        className="w-[480px] max-w-[92vw] rounded-lg p-5 shadow-2xl"
        style={{
          background: 'var(--vela-bg-sidebar-elev)',
          border: '1px solid var(--vela-border)',
        }}
      >
        <h3 className="mb-2 text-[14px] font-semibold text-red-400">
          Eliminar perfil “{profile.name}”
        </h3>

        {blockedByOpenWindows ? (
          <p className="text-[12.5px] leading-relaxed text-[var(--vela-fg-muted)]">
            Cierra todas las ventanas de este perfil antes de eliminarlo.
            {openWindowCount > 1
              ? ` Tienes ${openWindowCount} ventanas abiertas.`
              : ' Tienes 1 ventana abierta.'}
          </p>
        ) : (
          <>
            <p className="text-[12.5px] leading-relaxed text-[var(--vela-fg-muted)]">
              Vas a eliminar el perfil{' '}
              <strong className="text-[var(--vela-fg)]">{profile.name}</strong>.
              Esto borrará permanentemente:
            </p>
            <ul className="mt-2 list-disc pl-5 text-[12.5px] leading-relaxed text-[var(--vela-fg-muted)]">
              <li>
                {workspaceCount === null
                  ? 'todos sus workspaces'
                  : `${workspaceCount} workspace${workspaceCount === 1 ? '' : 's'}`}
              </li>
              <li>
                {savedTabCount === null
                  ? 'todas las pestañas guardadas'
                  : `${savedTabCount} pestañas guardadas`}
              </li>
              <li>todas las cookies y datos de sesión</li>
              <li>todas las extensiones instaladas</li>
            </ul>
            <p className="mt-2 text-[12.5px] font-medium text-red-400">
              Esta acción no se puede deshacer.
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--vela-fg-muted)]">
                Escribe “{profile.name}” para confirmar
              </label>
              <input
                type="text"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                className="w-full rounded border bg-[var(--vela-bg-app)] px-2 py-1.5 text-[13px] text-[var(--vela-fg)] outline-none"
                style={{ borderColor: 'var(--vela-border)' }}
              />
            </div>
          </>
        )}

        {error && (
          <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[12px] text-red-400">
            {error}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded px-3 py-1.5 text-[12px] text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
          >
            Cancelar
          </button>
          {!blockedByOpenWindows && (
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={!matches || submitting}
              className="rounded bg-red-500/90 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-red-500 disabled:opacity-50"
            >
              {submitting ? 'Eliminando…' : 'Eliminar permanentemente'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

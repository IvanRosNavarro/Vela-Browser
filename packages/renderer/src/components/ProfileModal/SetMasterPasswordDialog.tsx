import { useState } from 'react';
import type { Profile } from '@vela/shared';
import { call } from '../../lib/ipc';

const MIN_PASSWORD_LENGTH = 8;

export interface SetMasterPasswordDialogProps {
  profile: Profile;
  mode: 'add' | 'change' | 'remove';
  onCancel: () => void;
  onSuccess: (profile: Profile) => void;
}

/**
 * Diálogo para activar, cambiar o quitar la contraseña maestra del perfil.
 * El cifrado de los datos sensibles llega en el Prompt 7 (Argon2id +
 * XChaCha20-Poly1305); aquí solo gestionamos el flag visible y la pista,
 * pero el flujo de UI ya queda completo para que el resto del prompt 5
 * sea estable.
 */
export function SetMasterPasswordDialog({
  profile,
  mode,
  onCancel,
  onSuccess,
}: SetMasterPasswordDialogProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hint, setHint] = useState(profile.passwordHint ?? '');
  const [removeAck, setRemoveAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validNext = next.length >= MIN_PASSWORD_LENGTH;
  const matchNext = next === confirm;

  const isValid = (() => {
    if (mode === 'add') return validNext && matchNext;
    if (mode === 'change')
      return current.length > 0 && validNext && matchNext;
    return current.length > 0 && removeAck;
  })();

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      let updated: Profile;
      if (mode === 'remove') {
        updated = await call(() =>
          window.api.profile.removeMasterPassword({
            id: profile.id,
            currentMasterPassword: current,
          }),
        );
      } else {
        updated = await call(() =>
          window.api.profile.setMasterPassword({
            id: profile.id,
            masterPassword: next,
            hint: hint.trim() === '' ? null : hint.trim(),
            ...(mode === 'change'
              ? { currentMasterPassword: current }
              : {}),
          }),
        );
      }
      onSuccess(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const titleByMode = {
    add: 'Activar contraseña maestra',
    change: 'Cambiar contraseña maestra',
    remove: 'Quitar contraseña maestra',
  } as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onCancel}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex w-[460px] max-w-[92vw] flex-col gap-3 rounded-lg p-5 shadow-2xl"
        style={{
          background: 'var(--vela-bg-sidebar-elev)',
          border: '1px solid var(--vela-border)',
        }}
      >
        <h3 className="text-[14px] font-semibold text-[var(--vela-fg)]">
          {titleByMode[mode]} — {profile.name}
        </h3>

        <p className="text-[12px] text-[var(--vela-fg-muted)]">
          La contraseña maestra protege la clave de cifrado de tus datos
          sensibles. Si la pierdes, los datos protegidos no se podrán
          recuperar.
        </p>

        {(mode === 'change' || mode === 'remove') && (
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--vela-fg-muted)]">
              Contraseña actual
            </label>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoFocus
              className="w-full rounded border bg-[var(--vela-bg-app)] px-2 py-1.5 text-[13px] text-[var(--vela-fg)] outline-none"
              style={{ borderColor: 'var(--vela-border)' }}
            />
          </div>
        )}

        {(mode === 'add' || mode === 'change') && (
          <>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--vela-fg-muted)]">
                Nueva contraseña
              </label>
              <input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoFocus={mode === 'add'}
                className="w-full rounded border bg-[var(--vela-bg-app)] px-2 py-1.5 text-[13px] text-[var(--vela-fg)] outline-none"
                style={{ borderColor: 'var(--vela-border)' }}
              />
              {next.length > 0 && next.length < MIN_PASSWORD_LENGTH && (
                <div className="mt-1 text-[11px] text-amber-400">
                  Mínimo {MIN_PASSWORD_LENGTH} caracteres.
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--vela-fg-muted)]">
                Confirmar contraseña
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded border bg-[var(--vela-bg-app)] px-2 py-1.5 text-[13px] text-[var(--vela-fg)] outline-none"
                style={{ borderColor: 'var(--vela-border)' }}
              />
              {confirm.length > 0 && next !== confirm && (
                <div className="mt-1 text-[11px] text-amber-400">
                  Las contraseñas no coinciden.
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--vela-fg-muted)]">
                Pista (opcional)
              </label>
              <input
                type="text"
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                placeholder="Algo que sólo tú entiendas"
                className="w-full rounded border bg-[var(--vela-bg-app)] px-2 py-1.5 text-[13px] text-[var(--vela-fg)] outline-none"
                style={{ borderColor: 'var(--vela-border)' }}
              />
            </div>
          </>
        )}

        {mode === 'remove' && (
          <label className="flex items-start gap-2 text-[12px] text-[var(--vela-fg)]">
            <input
              type="checkbox"
              checked={removeAck}
              onChange={(e) => setRemoveAck(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Quiero quitar la contraseña maestra de este perfil. Entiendo
              que el perfil dejará de pedir desbloqueo.
            </span>
          </label>
        )}

        {error && (
          <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[12px] text-red-400">
            {error}
          </div>
        )}

        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded px-3 py-1.5 text-[12px] text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!isValid || submitting}
            className="rounded px-3 py-1.5 text-[12px] font-medium text-[var(--vela-fg)] disabled:opacity-50"
            style={{
              background:
                mode === 'remove' ? 'rgb(239 68 68 / 0.9)' : 'var(--vela-accent)',
            }}
          >
            {submitting
              ? 'Guardando…'
              : mode === 'remove'
                ? 'Quitar contraseña'
                : 'Guardar contraseña'}
          </button>
        </div>
      </form>
    </div>
  );
}

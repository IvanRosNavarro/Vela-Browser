import { useEffect, useMemo, useState } from 'react';
import {
  useProfileModalStore,
  useProfilesStore,
} from '../../stores';
import { useOverlay } from '../../lib/useOverlay';
import { call, IpcError } from '../../lib/ipc';
import { ProfileBadge } from '../ProfileSwitcher/ProfileBadge';
import { toast } from '../../stores/toastStore';

interface RateLimitDetails {
  retryAfterMs?: number;
  failedAttempts?: number;
}

interface InvalidPasswordDetails {
  failedAttempts?: number;
}

function formatRetryAfter(ms: number): string {
  const secs = Math.ceil(ms / 1000);
  if (secs <= 1) return '1 segundo';
  return `${secs} segundos`;
}

/**
 * Modal de desbloqueo de un perfil con contraseña maestra. Bloquea la
 * UI hasta que el usuario teclee la contraseña correcta o cancele. Tras
 * unlock exitoso, abrimos automáticamente la ventana del perfil para
 * que el flujo "elegir perfil → trabajar" sea de un solo paso.
 *
 * El rate limit local lo aplica el main: tras 5 fallos, los intentos
 * siguientes devuelven UNLOCK_RATE_LIMITED con retryAfterMs. Aquí
 * pintamos un contador en vivo para que el usuario sepa cuándo puede
 * volver a intentarlo.
 */
export function UnlockModal() {
  const open = useProfileModalStore((s) => s.unlockOpen);
  const targetId = useProfileModalStore((s) => s.unlockTargetId);
  const closeUnlock = useProfileModalStore((s) => s.closeUnlock);
  const profiles = useProfilesStore((s) => s.profiles);
  const archived = useProfilesStore((s) => s.archivedProfiles);

  const target = useMemo(
    () =>
      targetId
        ? [...profiles, ...archived].find((p) => p.id === targetId) ?? null
        : null,
    [targetId, profiles, archived],
  );

  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useOverlay(open);

  useEffect(() => {
    if (!open) {
      setPassword('');
      setError(null);
      setFailedAttempts(0);
      setRetryAt(null);
    }
  }, [open]);

  useEffect(() => {
    if (retryAt === null) return;
    const interval = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= retryAt) {
        setRetryAt(null);
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [retryAt]);

  if (!open || !target) return null;

  const remaining = retryAt ? Math.max(0, retryAt - now) : 0;
  const blocked = remaining > 0;

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    if (submitting || blocked) return;
    setSubmitting(true);
    setError(null);
    try {
      await call(() =>
        window.api.profile.unlock({
          id: target.id,
          masterPassword: password,
        }),
      );
      // Tras unlock el perfil queda abierto en main; el caso de uso típico
      // es abrir nueva ventana inmediatamente. Si esto falla, cerramos el
      // unlock y avisamos: el perfil sigue desbloqueado y se podrá usar.
      try {
        await call(() => window.api.profile.openWindow({ id: target.id }));
      } catch (winErr) {
        toast(
          `Perfil desbloqueado, pero no se pudo abrir la ventana: ${
            winErr instanceof Error ? winErr.message : String(winErr)
          }`,
          'error',
        );
      }
      closeUnlock();
    } catch (err) {
      if (err instanceof IpcError) {
        if (err.code === 'INVALID_MASTER_PASSWORD') {
          const details = (err.details ?? {}) as InvalidPasswordDetails;
          setFailedAttempts(details.failedAttempts ?? failedAttempts + 1);
          setError('Contraseña incorrecta.');
        } else if (err.code === 'UNLOCK_RATE_LIMITED') {
          const details = (err.details ?? {}) as RateLimitDetails;
          const retry = details.retryAfterMs ?? 30_000;
          setRetryAt(Date.now() + retry);
          setNow(Date.now());
          if (details.failedAttempts !== undefined) {
            setFailedAttempts(details.failedAttempts);
          }
          setError(
            `Demasiados intentos. Espera ${formatRetryAfter(retry)} antes de volver a intentarlo.`,
          );
        } else if (err.code === 'NOT_IMPLEMENTED') {
          setError(
            'La verificación criptográfica de la contraseña aún no está disponible en esta build (Prompt 7).',
          );
        } else {
          setError(`Error: ${err.code}`);
        }
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)' }}
    >
      <form
        onSubmit={handleSubmit}
        className="flex w-[420px] max-w-[92vw] flex-col gap-4 rounded-lg p-6 shadow-2xl"
        style={{
          background: 'var(--vela-bg-sidebar-elev)',
          border: '1px solid var(--vela-border)',
        }}
      >
        <div className="flex flex-col items-center gap-2">
          <ProfileBadge
            icon={target.icon}
            fallbackName={target.name}
            background={target.color}
            size={64}
          />
          <h2 className="text-[15px] font-semibold text-[var(--vela-fg)]">
            {target.name}
          </h2>
          {target.passwordHint && (
            <p className="text-[12px] text-[var(--vela-fg-muted)]">
              Pista: {target.passwordHint}
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--vela-fg-muted)]">
            Contraseña maestra
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={blocked || submitting}
            autoFocus
            className="w-full rounded border bg-[var(--vela-bg-app)] px-2 py-1.5 text-[13px] text-[var(--vela-fg)] outline-none disabled:opacity-50"
            style={{ borderColor: 'var(--vela-border)' }}
          />
        </div>

        {error && (
          <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[12px] text-red-400">
            {error}
            {failedAttempts > 0 && (
              <div className="mt-0.5 text-[11px] text-[var(--vela-fg-muted)]">
                Intentos fallidos: {failedAttempts}
              </div>
            )}
            {blocked && (
              <div className="mt-0.5 text-[11px] text-[var(--vela-fg-muted)]">
                Reintenta en {Math.ceil(remaining / 1000)}s
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={closeUnlock}
            disabled={submitting}
            className="rounded px-3 py-1.5 text-[12px] text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting || blocked || password.length === 0}
            className="rounded px-3 py-1.5 text-[12px] font-medium text-[var(--vela-fg)] disabled:opacity-50"
            style={{ background: 'var(--vela-accent)' }}
          >
            {submitting ? 'Desbloqueando…' : 'Desbloquear'}
          </button>
        </div>
      </form>
    </div>
  );
}

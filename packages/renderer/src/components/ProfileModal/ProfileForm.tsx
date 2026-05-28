import { useEffect, useState } from 'react';
import type { Profile } from '@vela/shared';
import { ColorPicker } from '../WorkspaceSwitcher/ColorPicker';
import { IconPicker } from '../WorkspaceSwitcher/IconPicker';
import { ProfileBadge } from '../ProfileSwitcher/ProfileBadge';

/**
 * Una contraseña >= 8 caracteres es nuestro mínimo viable. Validar
 * fortaleza más allá de la longitud queda fuera del alcance del Prompt 5
 * (la criptografía real llega en Prompt 7); el feedback visual se limita
 * por tanto a "longitud mínima" para no dar falsa sensación de seguridad.
 */
const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 32;

export interface ProfileFormValue {
  name: string;
  icon: string | null;
  color: string | null;
  /** Sólo en modo create con la sección de seguridad activada. */
  masterPassword?: string;
  passwordHint?: string | null;
}

export interface ProfileFormProps {
  initial?: Pick<Profile, 'name' | 'icon' | 'color' | 'passwordHint'> | null;
  /**
   * En modo edit no permitimos toquetear contraseña aquí: hay un diálogo
   * dedicado SetMasterPasswordDialog. El form sólo gestiona contraseña en
   * create.
   */
  showSecuritySection: boolean;
  onSubmit: (value: ProfileFormValue) => Promise<void> | void;
  onCancel: () => void;
  submitLabel?: string;
}

export function ProfileForm({
  initial,
  showSecuritySection,
  onSubmit,
  onCancel,
  submitLabel = 'Guardar',
}: ProfileFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [hasMaster, setHasMaster] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [hint, setHint] = useState(initial?.passwordHint ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(initial?.name ?? '');
    setIcon(initial?.icon ?? null);
    setColor(initial?.color ?? null);
    setHint(initial?.passwordHint ?? '');
    setError(null);
  }, [initial]);

  const trimmedName = name.trim();
  const validName =
    trimmedName.length > 0 && trimmedName.length <= MAX_NAME_LENGTH;
  const validPassword = !hasMaster || password.length >= MIN_PASSWORD_LENGTH;
  const passwordsMatch = !hasMaster || password === confirm;
  const valid = validName && validPassword && passwordsMatch;

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const value: ProfileFormValue = {
        name: trimmedName,
        icon,
        color,
      };
      if (showSecuritySection && hasMaster) {
        value.masterPassword = password;
        value.passwordHint = hint.trim() === '' ? null : hint.trim();
      }
      await onSubmit(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <ProfileBadge
          icon={icon}
          fallbackName={trimmedName || 'P'}
          background={color}
          size={36}
        />
        <div className="flex-1">
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--vela-fg-muted)]">
            Nombre
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={MAX_NAME_LENGTH}
            className="w-full rounded border bg-[var(--vela-bg-app)] px-2 py-1.5 text-[13px] text-[var(--vela-fg)] outline-none"
            style={{ borderColor: 'var(--vela-border)' }}
          />
          <div className="mt-1 text-right text-[10px] text-[var(--vela-fg-muted)]">
            {trimmedName.length}/{MAX_NAME_LENGTH}
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--vela-fg-muted)]">
          Color
        </label>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--vela-fg-muted)]">
          Icono
        </label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      {showSecuritySection && (
        <div
          className="rounded-md border"
          style={{ borderColor: 'var(--vela-border)' }}
        >
          <button
            type="button"
            onClick={() => setSecurityOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[12px] text-[var(--vela-fg)] hover:bg-[var(--vela-bg-row-hover)]"
          >
            <span>
              Seguridad avanzada
              {hasMaster && (
                <span className="ml-2 text-[var(--vela-fg-muted)]">
                  · contraseña activada
                </span>
              )}
            </span>
            <span className="text-[10px] text-[var(--vela-fg-muted)]">
              {securityOpen ? '▴' : '▾'}
            </span>
          </button>
          {securityOpen && (
            <div className="flex flex-col gap-3 px-3 pb-3">
              <label className="flex items-center gap-2 text-[12px] text-[var(--vela-fg)]">
                <input
                  type="checkbox"
                  checked={hasMaster}
                  onChange={(e) => {
                    setHasMaster(e.target.checked);
                    if (!e.target.checked) {
                      setPassword('');
                      setConfirm('');
                    }
                  }}
                />
                Exigir contraseña maestra al abrir el perfil
              </label>
              {hasMaster && (
                <>
                  <div>
                    <label className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--vela-fg-muted)]">
                      Contraseña
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className="w-full rounded border bg-[var(--vela-bg-app)] px-2 py-1.5 text-[13px] text-[var(--vela-fg)] outline-none"
                      style={{ borderColor: 'var(--vela-border)' }}
                    />
                    {password.length > 0 &&
                      password.length < MIN_PASSWORD_LENGTH && (
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
                    {confirm.length > 0 && password !== confirm && (
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
                  <p className="text-[11px] text-[var(--vela-fg-muted)]">
                    Si pierdes la contraseña, los datos cifrados del perfil no
                    se podrán recuperar.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
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
          className="rounded px-3 py-1.5 text-[12px] text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!valid || submitting}
          className="rounded px-3 py-1.5 text-[12px] font-medium text-[var(--vela-fg)] disabled:opacity-50"
          style={{ background: 'var(--vela-accent)' }}
        >
          {submitting ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

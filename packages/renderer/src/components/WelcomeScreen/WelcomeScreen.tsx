import { useState } from 'react';
import { useProfilesStore } from '../../stores/profilesStore';
import { ProfileForm, type ProfileFormValue } from '../ProfileModal/ProfileForm';
import { call, IpcError } from '../../lib/ipc';
import { VelaLogo } from '../../shared-ui/VelaLogo';

/**
 * Pantalla de bienvenida para el primer arranque cuando no hay perfiles.
 * No debería pasar normalmente — la migración inicial (Prompt 8) crea un
 * perfil "default" automáticamente — pero sirve de defensa por si esa
 * migración no se aplicó (BD reciente sin migrar, dev resetting datos).
 */
export function WelcomeScreen() {
  const create = useProfilesStore((s) => s.create);
  const reload = useProfilesStore((s) => s.reload);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (value: ProfileFormValue): Promise<void> => {
    setError(null);
    try {
      const profile = await create({
        name: value.name,
        icon: value.icon,
        color: value.color,
        ...(value.masterPassword !== undefined
          ? { masterPassword: value.masterPassword }
          : {}),
        ...(value.passwordHint !== undefined
          ? { passwordHint: value.passwordHint }
          : {}),
      });
      await reload();
      // Tras crear el perfil, abrimos su ventana de inmediato. La ventana
      // actual seguirá viva sin perfil hasta que el usuario la cierre, pero
      // dejamos al main la decisión de qué hacer con ella.
      try {
        await call(() =>
          window.api.profile.openWindow({ id: profile.id }),
        );
      } catch (winErr) {
        if (winErr instanceof IpcError) {
          setError(`Perfil creado, pero no se pudo abrir: ${winErr.code}`);
        } else {
          setError(
            winErr instanceof Error ? winErr.message : String(winErr),
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      className="flex h-screen w-screen flex-col items-center justify-center gap-6 px-6"
      style={{ background: 'var(--vela-bg-app)' }}
    >
      <VelaLogo size={4} />
      <div className="text-center">
        <h1 className="text-[20px] font-semibold text-[var(--vela-fg)]">
          Bienvenido a Vela
        </h1>
        <p className="mt-1 max-w-[420px] text-[13px] text-[var(--vela-fg-muted)]">
          Crea tu primer perfil para empezar. Cada perfil tiene sus
          workspaces, extensiones y datos completamente aislados del resto.
        </p>
      </div>

      {showForm ? (
        <div
          className="w-[480px] max-w-[92vw] rounded-lg p-5 shadow-2xl"
          style={{
            background: 'var(--vela-bg-sidebar-elev)',
            border: '1px solid var(--vela-border)',
          }}
        >
          <ProfileForm
            showSecuritySection
            onSubmit={handleSubmit}
            onCancel={() => setShowForm(false)}
            submitLabel="Crear perfil"
          />
          {error && (
            <div className="mt-3 rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[12px] text-red-400">
              {error}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded-md px-4 py-2 text-[13px] font-medium text-[var(--vela-fg)]"
          style={{ background: 'var(--vela-accent)' }}
        >
          Crear perfil
        </button>
      )}
    </div>
  );
}

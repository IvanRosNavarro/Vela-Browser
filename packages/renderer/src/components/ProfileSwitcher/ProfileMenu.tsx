import { useEffect, useRef } from 'react';
import type { Profile } from '@vela/shared';
import { useProfileModalStore } from '../../stores/profileModalStore';
import { toast } from '../../stores/toastStore';
import { call, IpcError } from '../../lib/ipc';
import { ProfileBadge } from './ProfileBadge';

export interface ProfileMenuProps {
  profile: Profile;
  onClose: () => void;
}

/**
 * Menú secundario que aparece al pulsar un perfil distinto del activo.
 * Muestra dos opciones: abrir en nueva ventana, o cambiar el perfil de
 * la ventana actual (deshabilitado en Fase 3 — Fase 4 lo activa).
 */
export function ProfileMenu({ profile, onClose }: ProfileMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const openUnlock = useProfileModalStore((s) => s.openUnlock);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleOpenWindow = async (withSecureTab = false): Promise<void> => {
    if (profile.hasMasterPassword) {
      openUnlock(profile.id);
      onClose();
      return;
    }
    try {
      await call(() =>
        window.api.profile.openWindow({ id: profile.id, withSecureTab: withSecureTab || undefined }),
      );
      onClose();
    } catch (err) {
      if (err instanceof IpcError && err.code === 'MASTER_PASSWORD_REQUIRED') {
        openUnlock(profile.id);
        onClose();
        return;
      }
      toast(
        `No se pudo abrir el perfil: ${err instanceof Error ? err.message : String(err)}`,
        'error',
      );
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      className="flex flex-col gap-1 rounded-md p-1 text-[13px] shadow-2xl"
      style={{
        background: 'var(--vela-bg-sidebar-elev)',
        border: '1px solid var(--vela-border)',
        minWidth: 220,
      }}
    >
      <div className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-[var(--vela-fg-muted)]">
        <ProfileBadge
          icon={profile.icon}
          fallbackName={profile.name}
          background={profile.color}
          size={18}
        />
        <span className="truncate">{profile.name}</span>
      </div>
      <button
        type="button"
        onClick={() => void handleOpenWindow()}
        className="rounded px-3 py-1.5 text-left text-[var(--vela-fg)] hover:bg-[var(--vela-bg-row-hover)]"
      >
        Abrir en nueva ventana
      </button>
      <button
        type="button"
        onClick={() => void handleOpenWindow(true)}
        className="flex items-center gap-2 rounded px-3 py-1.5 text-left hover:bg-[var(--vela-bg-row-hover)]"
        style={{ color: 'var(--vela-accent)' }}
      >
        <span className="ti ti-shield-lock" style={{ fontSize: 13, lineHeight: 1 }} aria-hidden />
        Abrir en ventana fantasma
      </button>
      <button
        type="button"
        disabled
        title="Próximamente. De momento usa nueva ventana."
        className="rounded px-3 py-1.5 text-left text-[var(--vela-fg-muted)] opacity-60"
      >
        Cambiar este ventana
      </button>
    </div>
  );
}

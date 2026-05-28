import type { Profile } from '@vela/shared';
import { Archive, ArchiveRestore, KeyRound, Lock, LockOpen, Pencil, Trash2 } from 'lucide-react';
import { ProfileBadge } from '../ProfileSwitcher/ProfileBadge';

export interface ProfileManagementTableProps {
  profiles: ReadonlyArray<Profile>;
  activeProfileId: string | null;
  /** Mapa profileId → número de ventanas abiertas. */
  openWindowsByProfile: ReadonlyMap<string, number>;
  onEdit: (profile: Profile) => void;
  onArchiveToggle: (profile: Profile) => Promise<void> | void;
  onDelete: (profile: Profile) => void;
  onSetMasterPassword: (profile: Profile, mode: 'add' | 'change' | 'remove') => void;
}

function formatLastUsed(ts: number | null): string {
  if (ts === null) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'hace instantes';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return new Date(ts).toLocaleDateString();
}

function statusLabel(
  profile: Profile,
  openWindows: number,
  isActive: boolean,
): string {
  if (profile.archived) return 'Archivado';
  if (openWindows > 0) {
    return `Activo · ${openWindows} ventana${openWindows === 1 ? '' : 's'}${
      isActive ? ' (actual)' : ''
    }`;
  }
  return 'Cerrado';
}

export function ProfileManagementTable({
  profiles,
  activeProfileId,
  openWindowsByProfile,
  onEdit,
  onArchiveToggle,
  onDelete,
  onSetMasterPassword,
}: ProfileManagementTableProps) {
  if (profiles.length === 0) {
    return (
      <div className="py-8 text-center text-[12px] text-[var(--vela-fg-muted)]">
        No hay perfiles.
      </div>
    );
  }
  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr
          className="border-b text-left"
          style={{ borderColor: 'var(--vela-border)' }}
        >
          <th className="pb-2.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-[var(--vela-fg-muted)]">
            Perfil
          </th>
          <th className="pb-2.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-[var(--vela-fg-muted)]">
            Último uso
          </th>
          <th className="pb-2.5 pr-4 text-[11px] font-medium uppercase tracking-wide text-[var(--vela-fg-muted)]">
            Estado
          </th>
          <th className="pb-2.5 text-right text-[11px] font-medium uppercase tracking-wide text-[var(--vela-fg-muted)]">
            Acciones
          </th>
        </tr>
      </thead>
      <tbody>
        {profiles.map((profile) => {
          const openWindows = openWindowsByProfile.get(profile.id) ?? 0;
          const isActive = profile.id === activeProfileId;
          return (
            <tr
              key={profile.id}
              className="group border-b last:border-b-0 transition-colors hover:bg-[var(--vela-bg-row-hover)]"
              style={{ borderColor: 'var(--vela-border)' }}
            >
              <td className="py-2.5 pr-4">
                <div className="flex items-center gap-2.5">
                  <ProfileBadge
                    icon={profile.icon}
                    fallbackName={profile.name}
                    background={profile.color}
                    size={22}
                  />
                  <span
                    className="text-[13px]"
                    style={{ color: profile.archived ? 'var(--vela-fg-muted)' : 'var(--vela-fg)' }}
                  >
                    {profile.name}
                  </span>
                  {profile.hasMasterPassword && (
                    <Lock
                      size={12}
                      className="shrink-0 text-[var(--vela-fg-muted)]"
                      aria-label="Protegido con contraseña maestra"
                    />
                  )}
                </div>
              </td>
              <td className="py-2.5 pr-4 text-[11px] text-[var(--vela-fg-muted)]">
                {formatLastUsed(profile.lastUsedAt)}
              </td>
              <td className="py-2.5 pr-4">
                <span
                  className="text-[11px]"
                  style={{
                    color:
                      openWindows > 0
                        ? 'var(--vela-accent)'
                        : 'var(--vela-fg-muted)',
                  }}
                >
                  {statusLabel(profile, openWindows, isActive)}
                </span>
              </td>
              <td className="py-2.5 text-right">
                <div className="flex items-center justify-end gap-0.5">
                  <button
                    type="button"
                    onClick={() => onEdit(profile)}
                    title="Editar perfil"
                    aria-label="Editar perfil"
                    className="rounded p-1.5 text-[var(--vela-fg-muted)] transition-colors hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onSetMasterPassword(
                        profile,
                        profile.hasMasterPassword ? 'change' : 'add',
                      )
                    }
                    title={
                      profile.hasMasterPassword
                        ? 'Cambiar contraseña maestra'
                        : 'Activar contraseña maestra'
                    }
                    aria-label={
                      profile.hasMasterPassword
                        ? 'Cambiar contraseña maestra'
                        : 'Activar contraseña maestra'
                    }
                    className="rounded p-1.5 text-[var(--vela-fg-muted)] transition-colors hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
                  >
                    <KeyRound size={14} />
                  </button>
                  {profile.hasMasterPassword && (
                    <button
                      type="button"
                      onClick={() => onSetMasterPassword(profile, 'remove')}
                      title="Quitar contraseña maestra"
                      aria-label="Quitar contraseña maestra"
                      className="rounded p-1.5 text-[var(--vela-fg-muted)] transition-colors hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
                    >
                      <LockOpen size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void onArchiveToggle(profile)}
                    title={profile.archived ? 'Desarchivar perfil' : 'Archivar perfil'}
                    aria-label={profile.archived ? 'Desarchivar perfil' : 'Archivar perfil'}
                    className="rounded p-1.5 text-[var(--vela-fg-muted)] transition-colors hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
                  >
                    {profile.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(profile)}
                    title="Eliminar perfil"
                    aria-label="Eliminar perfil"
                    className="rounded p-1.5 text-red-400/60 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

import type { Profile } from '@vela/shared';
import { ProfileBadge } from './ProfileBadge';

export interface ProfileListProps {
  profiles: ReadonlyArray<Profile>;
  activeProfileId: string | null;
  /**
   * Conjunto de IDs de perfiles que están abiertos en alguna ventana.
   * En Fase 3 sólo conocemos con certeza el de la ventana actual; los
   * demás se asumen "cerrados" salvo que ProfileWindowManager exponga
   * la lista (queda pendiente para Fase 4).
   */
  openProfileIds?: ReadonlySet<string>;
  onSelect: (profile: Profile) => void;
}

export function ProfileList({
  profiles,
  activeProfileId,
  openProfileIds,
  onSelect,
}: ProfileListProps) {
  if (profiles.length === 0) {
    return (
      <div className="px-3 py-2 text-[12px] text-[var(--vela-fg-muted)]">
        No hay perfiles.
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {profiles.map((profile) => {
        const isActive = profile.id === activeProfileId;
        const isOpenElsewhere =
          !isActive && (openProfileIds?.has(profile.id) ?? false);
        return (
          <button
            key={profile.id}
            type="button"
            role="menuitem"
            onClick={() => onSelect(profile)}
            className="flex items-center gap-2 px-2 py-1.5 text-left hover:bg-[var(--vela-bg-row-hover)]"
            style={{ position: 'relative' }}
          >
            {isActive && (
              <span
                aria-hidden
                className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded"
                style={{ background: 'var(--vela-accent)' }}
              />
            )}
            <ProfileBadge
              icon={profile.icon}
              fallbackName={profile.name}
              background={profile.color}
              size={20}
            />
            <span className="flex-1 truncate text-[13px] text-[var(--vela-fg)]">
              {profile.name}
            </span>
            {profile.hasMasterPassword && (
              <span
                title="Protegido con contraseña maestra"
                aria-label="Protegido con contraseña maestra"
                className="text-[var(--vela-fg-muted)]"
                style={{ fontSize: 11 }}
              >
                🔒
              </span>
            )}
            {isOpenElsewhere && (
              <span
                className="rounded px-1.5 py-0.5 text-[10px]"
                style={{
                  border: '1px solid var(--vela-border)',
                  color: 'var(--vela-fg-muted)',
                }}
              >
                abierto
              </span>
            )}
            {isActive && (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] uppercase"
                style={{
                  background: 'var(--vela-accent)',
                  color: 'var(--vela-fg)',
                }}
              >
                actual
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Profile } from '@vela/shared';
import {
  useProfileModalStore,
  useProfilesStore,
} from '../../stores';
import { useOverlay } from '../../lib/useOverlay';
import { ProfileList } from './ProfileList';
import { ProfileMenu } from './ProfileMenu';

export interface ProfileDropdownProps {
  open: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement>;
}

/**
 * Dropdown de perfiles que se abre desde el ProfileSwitcher. Distinguimos
 * dos clicks:
 *  - sobre el perfil de la ventana actual: cierra el dropdown sin más;
 *  - sobre otro perfil: muestra ProfileMenu con "abrir en nueva ventana"
 *    (la opción de "cambiar este ventana" llega en Fase 4).
 *
 * Pinta también accesos a "Nuevo perfil" y "Gestionar perfiles" que
 * abren ProfileModal en sus respectivos modos.
 */
export function ProfileDropdown({
  open,
  onClose,
  triggerRef,
}: ProfileDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);
  useOverlay(open);

  const profiles = useProfilesStore((s) => s.profiles);
  const activeProfileId = useProfilesStore((s) => s.activeProfileId);
  const openCreate = useProfileModalStore((s) => s.openCreate);
  const openManage = useProfileModalStore((s) => s.openManage);

  const [submenuFor, setSubmenuFor] = useState<Profile | null>(null);

  useEffect(() => {
    if (!open) {
      setSubmenuFor(null);
      return;
    }
    const onClick = (e: MouseEvent): void => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, triggerRef]);

  const sortedProfiles = useMemo(
    () => [...profiles].sort((a, b) => (a.position < b.position ? -1 : 1)),
    [profiles],
  );

  if (!open) return null;

  const handleSelect = (profile: Profile): void => {
    if (profile.id === activeProfileId) {
      onClose();
      return;
    }
    setSubmenuFor(profile);
  };

  return (
    <div
      ref={ref}
      role="menu"
      className="absolute bottom-full left-0 z-30 mb-2 min-w-[260px] rounded-md py-1 text-[13px] shadow-2xl"
      style={{
        background: 'var(--vela-bg-sidebar-elev)',
        border: '1px solid var(--vela-border)',
      }}
    >
      {submenuFor ? (
        <ProfileMenu
          profile={submenuFor}
          onClose={() => {
            setSubmenuFor(null);
            onClose();
          }}
        />
      ) : (
        <>
          <div className="px-3 pt-1 pb-1 text-[10px] uppercase tracking-wide text-[var(--vela-fg-muted)]">
            Perfiles
          </div>
          <ProfileList
            profiles={sortedProfiles}
            activeProfileId={activeProfileId}
            onSelect={handleSelect}
          />
          <div
            className="my-1 border-t"
            style={{ borderColor: 'var(--vela-border)' }}
          />
          <button
            type="button"
            onClick={() => {
              onClose();
              void openCreate();
            }}
            className="block w-full px-3 py-1.5 text-left text-[var(--vela-fg)] hover:bg-[var(--vela-bg-row-hover)]"
          >
            + Nuevo perfil
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              void openManage();
            }}
            className="block w-full px-3 py-1.5 text-left text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
          >
            Gestionar perfiles
          </button>
        </>
      )}
    </div>
  );
}

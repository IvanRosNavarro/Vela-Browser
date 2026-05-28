import { useCallback, useMemo, useRef } from 'react';
import { useProfilesStore, useUiStore } from '../../stores';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { ProfileBadge } from './ProfileBadge';

export function ProfileSwitcher() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const profiles = useProfilesStore((s) => s.profiles);
  const archived = useProfilesStore((s) => s.archivedProfiles);
  const activeProfileId = useProfilesStore((s) => s.activeProfileId);
  const sidebarMode = useUiStore((s) => s.sidebarMode);
  const sidebarWidthNormal = useUiStore((s) => s.sidebarWidthNormal);
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const compact = sidebarMode === 'compact';
  const showName = !compact && sidebarWidthNormal >= 170;

  const active = useMemo(
    () =>
      [...profiles, ...archived].find((p) => p.id === activeProfileId) ?? null,
    [profiles, archived, activeProfileId],
  );

  const handleOpen = useCallback(() => {
    if (!triggerRef.current || currentWindowId === null) return;
    const rect = triggerRef.current.getBoundingClientRect();
    void window.api.profileDrop.open({
      windowId: currentWindowId,
      anchorRect: { left: rect.left, top: rect.top },
      profileCount: profiles.length,
    });
  }, [currentWindowId, profiles.length]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        aria-haspopup="menu"
        title={active?.name ?? 'Perfil'}
        className={`flex w-full items-center gap-2 rounded-md py-1 text-left hover:bg-[var(--vela-bg-row-hover)] ${showName ? 'px-1.5' : 'justify-center px-0'}`}
        style={{ color: 'var(--vela-fg)' }}
      >
        <ProfileBadge
          icon={active?.icon}
          fallbackName={active?.name ?? 'P'}
          background={active?.color ?? null}
          size={24}
        />
        {showName && (
          <>
            <span className="flex-1 truncate text-[12.5px] text-[var(--vela-fg)]">
              {active?.name ?? 'Sin perfil'}
            </span>
            <span
              aria-hidden
              className="text-[10px] text-[var(--vela-fg-muted)]"
            >
              ▾
            </span>
          </>
        )}
      </button>
    </div>
  );
}

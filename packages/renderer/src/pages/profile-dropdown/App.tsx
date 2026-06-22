import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Profile } from '@vela/shared';
import { getGlassStyle } from '../../lib/popupGlass';

const params = new URLSearchParams(window.location.search);
const parentWindowId = parseInt(params.get('windowId') ?? '0', 10);

function ProfileBadge({ icon, fallbackName, background, size }: {
  icon?: string | null;
  fallbackName: string;
  background?: string | null;
  size: number;
}) {
  const initial = fallbackName.charAt(0).toUpperCase();
  const bg = background ?? '#5b8ef4';

  if (icon) {
    return (
      <span
        style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.65, flexShrink: 0 }}
        role="img"
        aria-label={fallbackName}
      >
        {icon}
      </span>
    );
  }

  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.5,
        fontWeight: 700,
        color: '#fff',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {initial}
    </span>
  );
}

interface ProfileRowProps {
  profile: Profile;
  isActive: boolean;
  onSelect: () => void;
}

function ProfileRow({ profile, isActive, onSelect }: ProfileRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '5px 12px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        position: 'relative',
        color: 'var(--vela-fg, #e6e8ee)',
        fontSize: 13,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.06))'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
    >
      {isActive && (
        <span aria-hidden style={{
          position: 'absolute', left: 0, top: 4, bottom: 4,
          width: 2, borderRadius: 2, background: 'var(--vela-accent, #5b8ef4)',
        }} />
      )}
      <ProfileBadge icon={profile.icon} fallbackName={profile.name} background={profile.color} size={24} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {profile.name}
      </span>
    </button>
  );
}

interface ProfileSubmenuProps {
  profile: Profile;
  onBack: () => void;
}

function ProfileSubmenu({ profile, onBack }: ProfileSubmenuProps) {
  const handleOpenWindow = useCallback(async (withSecureTab = false): Promise<void> => {
    if (profile.hasMasterPassword) {
      await window.api.profileDrop.triggerModal({
        windowId: parentWindowId,
        mode: 'unlock',
        profileId: profile.id,
      });
      return;
    }
    await window.api.profile.openWindow({ id: profile.id, withSecureTab: withSecureTab || undefined });
    window.close();
  }, [profile]);

  const btnStyle: React.CSSProperties = {
    display: 'block', width: '100%', padding: '6px 12px',
    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
    fontSize: 13, color: 'var(--vela-fg, #e6e8ee)',
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 4px' }}>
        <button
          type="button"
          onClick={onBack}
          title="Volver"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vela-fg-muted, #8c93a3)', padding: 0, fontSize: 13 }}
        >
          ←
        </button>
        <ProfileBadge icon={profile.icon} fallbackName={profile.name} background={profile.color} size={18} />
        <span style={{ fontSize: 12, color: 'var(--vela-fg-muted, #8c93a3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {profile.name}
        </span>
      </div>
      <div style={{ height: 1, background: 'var(--vela-border, rgba(255,255,255,0.09))', margin: '2px 0' }} />
      <button
        type="button"
        style={btnStyle}
        onClick={() => void handleOpenWindow()}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.06))'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
      >
        Abrir en nueva ventana
      </button>
      <button
        type="button"
        style={{ ...btnStyle, color: 'var(--vela-accent, #5b8ef4)', display: 'flex', alignItems: 'center', gap: 6 }}
        onClick={() => void handleOpenWindow(true)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.06))'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
      >
        Abrir en ventana fantasma
      </button>
    </>
  );
}

export function App() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [submenuFor, setSubmenuFor] = useState<Profile | null>(null);

  useEffect(() => {
    void Promise.all([
      window.api.profile.list(),
      window.api.profile.getActive(),
    ]).then(([listRes, activeRes]) => {
      if (listRes.ok) setProfiles(listRes.data);
      if (activeRes.ok) setActiveProfileId(activeRes.data.profileId);
    });
  }, []);

  const sortedProfiles = useMemo(
    () => [...profiles].sort((a, b) => (a.position < b.position ? -1 : 1)),
    [profiles],
  );

  const handleSelect = useCallback((profile: Profile): void => {
    if (profile.id === activeProfileId) {
      window.close();
      return;
    }
    setSubmenuFor(profile);
  }, [activeProfileId]);

  const handleNewProfile = useCallback(async (): Promise<void> => {
    await window.api.profileDrop.triggerModal({ windowId: parentWindowId, mode: 'create' });
  }, []);

  const handleManage = useCallback(async (): Promise<void> => {
    await window.api.profileDrop.triggerModal({ windowId: parentWindowId, mode: 'manage' });
  }, []);

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--vela-bg-surface, #1c1f26)',
    border: '1px solid var(--vela-border, rgba(255,255,255,0.09))',
    borderRadius: 8,
    overflow: 'hidden',
    paddingTop: 4,
    paddingBottom: 4,
    ...getGlassStyle(),
  };

  const btnRowStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '6px 12px',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    fontSize: 13,
    cursor: 'pointer',
    color: 'var(--vela-fg, #e6e8ee)',
  };

  const mutedBtnStyle: React.CSSProperties = {
    ...btnRowStyle,
    color: 'var(--vela-fg-muted, #8c93a3)',
  };

  if (submenuFor) {
    return (
      <div style={containerStyle}>
        <ProfileSubmenu
          profile={submenuFor}
          onBack={() => setSubmenuFor(null)}
        />
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={{ padding: '2px 12px 4px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--vela-fg-muted, #8c93a3)' }}>
        Perfiles
      </div>
      {sortedProfiles.map((p) => (
        <ProfileRow
          key={p.id}
          profile={p}
          isActive={p.id === activeProfileId}
          onSelect={() => handleSelect(p)}
        />
      ))}
      <div style={{ height: 1, background: 'var(--vela-border, rgba(255,255,255,0.09))', margin: '4px 0' }} />
      <button
        type="button"
        style={btnRowStyle}
        onClick={() => void handleNewProfile()}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.06))'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
      >
        + Nuevo perfil
      </button>
      <button
        type="button"
        style={mutedBtnStyle}
        onClick={() => void handleManage()}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.06))'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
      >
        Gestionar perfiles
      </button>
    </div>
  );
}

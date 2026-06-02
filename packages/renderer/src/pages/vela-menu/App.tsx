import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { getGlassStyle } from '../../lib/popupGlass';
import type { Profile, Workspace, HistorySearchEntry } from '@vela/shared';

const params = new URLSearchParams(window.location.search);
const parentWindowId = parseInt(params.get('windowId') ?? '0', 10);
const IS_BLINDED_WINDOW = params.get('isBlinded') === '1';

type SubView = 'workspaces' | 'history' | 'profiles' | 'developer';

// ── Inline SVGs ───────────────────────────────────────────────────────────────

function IcoRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
function IcoPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IcoMask() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 10C2 6.5 6.5 4 12 4s10 2.5 10 6c-1.5 2.5-4.5 3-7 1.5-.5-.3-1-.5-1.5-.5h-3c-.5 0-1 .2-1.5.5C6.5 13 3.5 12.5 2 10z" />
      <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M10.5 15.5Q12 17 13.5 15.5" />
    </svg>
  );
}
function IcoGhost() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a9 9 0 0 1 9 9v8l-2 -2l-2 2l-2 -2l-2 2l-2 -2l-2 2v-8a9 9 0 0 1 9 -9z" />
      <circle cx="9" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IcoBrowser() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" />
      <line x1="9" y1="21" x2="9" y2="9" />
    </svg>
  );
}
function IcoSidebar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}
function IcoHistory() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="12 8 12 12 14 14" /><path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
    </svg>
  );
}
function IcoKey() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="M21 2l-9.6 9.6" />
      <path d="M15.5 7.5l3 3L22 7l-3-3" />
    </svg>
  );
}
function IcoDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
function IcoStar() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function IcoUser() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
function IcoPuzzle() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}
function IcoCode() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
    </svg>
  );
}
function IcoSettings() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function IcoX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IcoCheck() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IcoChevronRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}
function IcoChevronLeft() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ProfileAvatar({ name, color }: { name: string; color: string | null }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <span style={{
      width: 18, height: 18, borderRadius: '50%',
      background: color ?? 'var(--vela-accent, #4f8ef7)',
      color: '#fff', fontSize: 11, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {initial}
    </span>
  );
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'ahora';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`;
  return `${Math.floor(diff / 86_400_000)} d`;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--vela-bg-surface, #1c1f26)',
  border: '1px solid var(--vela-border, rgba(255,255,255,0.09))',
  borderRadius: 8,
  ...getGlassStyle(),
};

const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '4px 0',
};

const sepStyle: CSSProperties = {
  height: 1,
  background: 'var(--vela-border, rgba(255,255,255,0.08))',
  margin: '3px 0',
  flexShrink: 0,
};

const iconWrap: CSSProperties = {
  width: 16, height: 16, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--vela-fg-muted, rgba(255,255,255,0.5))',
};

const kbdStyle: CSSProperties = {
  marginLeft: 'auto', fontSize: 10,
  color: 'var(--vela-fg-muted, rgba(255,255,255,0.35))', flexShrink: 0,
};

const arrowStyle: CSSProperties = {
  marginLeft: 'auto', flexShrink: 0,
  color: 'var(--vela-fg-muted, rgba(255,255,255,0.35))',
};

const checkStyle: CSSProperties = {
  width: 16, height: 16, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--vela-accent, #4f8ef7)',
};

// ── MenuItem ──────────────────────────────────────────────────────────────────

function MenuItem({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        height: 32, padding: '0 10px',
        background: hovered ? 'var(--vela-hover, rgba(255,255,255,0.07))' : 'transparent',
        border: 'none', width: '100%', textAlign: 'left', outline: 'none',
        fontSize: 13, color: 'var(--vela-fg, #e0e0e0)',
        cursor: 'default', userSelect: 'none', flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export function App() {
  const [subView, setSubView] = useState<SubView | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistorySearchEntry[]>([]);
  const [version, setVersion] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Resize window to match container's actual content height
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    window.resizeTo(window.outerWidth, el.offsetHeight);
  });

  useEffect(() => {
    void Promise.allSettled([
      window.api.workspaces.list(),
      window.api.workspaces.getActive(),
      window.api.profile.list(),
      window.api.profile.getActive(),
      window.api.history.getRecent({ limit: 5 }),
      window.api.runtime.getVersions(),
    ]).then(([wsL, wsA, pfL, pfA, histR, verR]) => {
      if (wsL.status === 'fulfilled' && wsL.value.ok) {
        setWorkspaces([...wsL.value.data].sort((a, b) => (a.position < b.position ? -1 : 1)));
      }
      if (wsA.status === 'fulfilled' && wsA.value.ok) setActiveWsId(wsA.value.data?.id ?? null);
      if (pfL.status === 'fulfilled' && pfL.value.ok) {
        setProfiles([...pfL.value.data].sort((a, b) => (a.position < b.position ? -1 : 1)));
      }
      if (pfA.status === 'fulfilled' && pfA.value.ok) setActiveProfileId(pfA.value.data.profileId ?? null);
      if (histR.status === 'fulfilled' && histR.value.ok) setHistory(histR.value.data);
      if (verR.status === 'fulfilled' && verR.value.ok) setVersion(verR.value.data.app);
    });
  }, []);

  const exec = useCallback((commandId: string) => {
    void window.api.commands.execute(commandId, { targetWindowId: parentWindowId });
    window.close();
  }, []);

  const navigate = useCallback((url: string) => {
    void window.api.velaMenu.navigate({ windowId: parentWindowId, url });
  }, []);

  return (
    <div ref={containerRef} style={containerStyle}>
      {!subView ? (
        // ── Main panel ──────────────────────────────────────────────────────
        <div style={panelStyle}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            height: 34, padding: '0 10px',
            color: 'var(--vela-fg, #e0e0e0)', userSelect: 'none', flexShrink: 0,
          }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Vela</span>
            {version && (
              <span style={{ fontSize: 11, color: 'var(--vela-fg-muted, rgba(255,255,255,0.4))' }}>
                v{version}
              </span>
            )}
          </div>

          {IS_BLINDED_WINDOW ? (
            // ── Menú simplificado para ventanas fantasma ──────────────────────
            <>
              <div style={sepStyle} />
              <MenuItem onClick={() => exec('tab.createSecure')}>
                <span style={iconWrap}><IcoMask /></span>
                Nueva pestaña fantasma
                <span style={kbdStyle}>Ctrl+Shift+N</span>
              </MenuItem>
              <MenuItem onClick={() => exec('window.openBlinded')}>
                <span style={iconWrap}><IcoGhost /></span>
                Nueva ventana fantasma
              </MenuItem>
              <div style={sepStyle} />
              <MenuItem onClick={() => setSubView('developer')}>
                <span style={iconWrap}><IcoCode /></span>
                Desarrollador
                <span style={arrowStyle}><IcoChevronRight /></span>
              </MenuItem>
              <div style={sepStyle} />
              <MenuItem onClick={() => { void window.api.window.close(); window.close(); }}>
                <span style={{ ...iconWrap, color: 'var(--vela-fg-muted, rgba(255,255,255,0.5))' }}><IcoX /></span>
                <span style={{ color: 'var(--vela-fg-muted, rgba(255,255,255,0.7))' }}>Cerrar ventana</span>
              </MenuItem>
            </>
          ) : (
            // ── Menú completo ─────────────────────────────────────────────────
            <>
              <div style={sepStyle} />
              <MenuItem onClick={() => { void window.api.update.checkNow(); window.close(); }}>
                <span style={iconWrap}><IcoRefresh /></span>
                Buscar actualizaciones
              </MenuItem>
              <div style={sepStyle} />
              <MenuItem onClick={() => exec('internal.openNewTab')}>
                <span style={iconWrap}><IcoPlus /></span>
                Nueva pestaña
                <span style={kbdStyle}>Ctrl+T</span>
              </MenuItem>
              <MenuItem onClick={() => exec('tab.createSecure')}>
                <span style={iconWrap}><IcoMask /></span>
                Nueva pestaña fantasma
                <span style={kbdStyle}>Ctrl+Shift+N</span>
              </MenuItem>
              <MenuItem onClick={() => exec('profile.openInNewWindow')}>
                <span style={iconWrap}><IcoBrowser /></span>
                Nueva ventana
                <span style={kbdStyle}>Ctrl+N</span>
              </MenuItem>
              <MenuItem onClick={() => exec('window.openBlinded')}>
                <span style={iconWrap}><IcoGhost /></span>
                Nueva ventana fantasma
              </MenuItem>
              <div style={sepStyle} />
              <MenuItem onClick={() => setSubView('workspaces')}>
                <span style={iconWrap}><IcoSidebar /></span>
                Workspaces
                <span style={arrowStyle}><IcoChevronRight /></span>
              </MenuItem>
              <div style={sepStyle} />
              <MenuItem onClick={() => setSubView('history')}>
                <span style={iconWrap}><IcoHistory /></span>
                Historial
                <span style={arrowStyle}><IcoChevronRight /></span>
              </MenuItem>
              <MenuItem onClick={() => { void window.api.window.openUrlInNewTab({ url: 'vela://favorites' }); window.close(); }}>
                <span style={iconWrap}><IcoStar /></span>
                Favoritos
              </MenuItem>
              <MenuItem onClick={() => { void window.api.vault.openManager({ windowId: parentWindowId }); window.close(); }}>
                <span style={iconWrap}><IcoKey /></span>
                Contraseñas
              </MenuItem>
              <MenuItem onClick={() => exec('internal.openDownloads')}>
                <span style={iconWrap}><IcoDownload /></span>
                Descargas
                <span style={kbdStyle}>Ctrl+J</span>
              </MenuItem>
              <div style={sepStyle} />
              <MenuItem onClick={() => setSubView('profiles')}>
                <span style={iconWrap}><IcoUser /></span>
                Perfiles
                <span style={arrowStyle}><IcoChevronRight /></span>
              </MenuItem>
              <MenuItem onClick={() => exec('internal.openExtensions')}>
                <span style={iconWrap}><IcoPuzzle /></span>
                Extensiones
              </MenuItem>
              <MenuItem onClick={() => setSubView('developer')}>
                <span style={iconWrap}><IcoCode /></span>
                Desarrollador
                <span style={arrowStyle}><IcoChevronRight /></span>
              </MenuItem>
              <div style={sepStyle} />
              <MenuItem onClick={() => exec('internal.openSettings')}>
                <span style={iconWrap}><IcoSettings /></span>
                Ajustes
                <span style={kbdStyle}>Ctrl+,</span>
              </MenuItem>
              <div style={sepStyle} />
              <MenuItem onClick={() => { void window.api.window.close(); window.close(); }}>
                <span style={{ ...iconWrap, color: 'var(--vela-fg-muted, rgba(255,255,255,0.5))' }}><IcoX /></span>
                <span style={{ color: 'var(--vela-fg-muted, rgba(255,255,255,0.7))' }}>Cerrar ventana</span>
              </MenuItem>
            </>
          )}
        </div>
      ) : (
        // ── Sub panel ───────────────────────────────────────────────────────
        <div style={panelStyle}>
          {/* Back header */}
          <button
            type="button"
            onClick={() => setSubView(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 32, padding: '0 10px', background: 'none', border: 'none',
              color: 'var(--vela-fg-muted, rgba(255,255,255,0.5))',
              fontSize: 12, cursor: 'default', flexShrink: 0, width: '100%', textAlign: 'left',
              outline: 'none',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.07))'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          >
            <IcoChevronLeft />
            {subView === 'workspaces' && 'Workspaces'}
            {subView === 'history' && 'Historial reciente'}
            {subView === 'profiles' && 'Perfiles'}
            {subView === 'developer' && 'Desarrollador'}
          </button>

          <div style={sepStyle} />

          {/* Workspaces */}
          {subView === 'workspaces' && <>
            {workspaces.length === 0 && (
              <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--vela-fg-muted, rgba(255,255,255,0.4))' }}>
                No hay workspaces
              </div>
            )}
            {workspaces.map((ws) => (
              <MenuItem key={ws.id} onClick={() => { void window.api.workspaces.setActive({ id: ws.id }); window.close(); }}>
                <span style={checkStyle}>{ws.id === activeWsId && <IcoCheck />}</span>
                <span style={{ flexShrink: 0, fontSize: 14, lineHeight: '1' }}>{ws.icon ?? '🗂'}</span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ws.name}
                </span>
              </MenuItem>
            ))}
            {workspaces.length > 0 && <div style={sepStyle} />}
            <MenuItem onClick={() => navigate('vela://settings')}>Gestionar workspaces →</MenuItem>
          </>}

          {/* History */}
          {subView === 'history' && <>
            {history.length === 0 && (
              <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--vela-fg-muted, rgba(255,255,255,0.4))' }}>
                Sin entradas recientes
              </div>
            )}
            {history.map((entry) => (
              <MenuItem key={entry.id} onClick={() => navigate(entry.url)}>
                {entry.favicon ? (
                  <img src={entry.favicon} width={14} height={14}
                    style={{ borderRadius: 2, flexShrink: 0 }} alt=""
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <span style={{ ...iconWrap, opacity: 0.4, fontSize: 12 }}>🌐</span>
                )}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.title || entry.url}
                </span>
                <span style={{ ...kbdStyle, fontSize: 10 }}>{formatRelativeTime(entry.visitedAt)}</span>
              </MenuItem>
            ))}
            {history.length > 0 && <div style={sepStyle} />}
            <MenuItem onClick={() => exec('internal.openHistory')}>Ver todo el historial →</MenuItem>
          </>}

          {/* Profiles */}
          {subView === 'profiles' && <>
            {profiles.map((profile) => (
              <MenuItem key={profile.id} onClick={() => { void window.api.profile.openWindow({ id: profile.id }); window.close(); }}>
                <span style={checkStyle}>{profile.id === activeProfileId && <IcoCheck />}</span>
                <ProfileAvatar name={profile.name} color={profile.color} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {profile.name}
                </span>
              </MenuItem>
            ))}
            {profiles.length > 0 && <div style={sepStyle} />}
            <MenuItem onClick={() => exec('profile.create')}>
              <span style={iconWrap}><IcoPlus /></span>
              Nuevo perfil
            </MenuItem>
          </>}

          {/* Developer */}
          {subView === 'developer' && <>
            <MenuItem onClick={() => exec('devtools.toggleForActiveTab')}>
              <span style={iconWrap}><IcoCode /></span>
              Herramientas de desarrollador
            </MenuItem>
            <MenuItem onClick={() => exec('view.toggleDeviceMode')}>Modo responsive</MenuItem>
            <MenuItem onClick={() => exec('devtools.captureBugSnapshot')}>Capturar snapshot de bug</MenuItem>
            <div style={sepStyle} />
            <MenuItem onClick={() => exec('internal.openScripts')}>Scripts de usuario →</MenuItem>
          </>}
        </div>
      )}
    </div>
  );
}

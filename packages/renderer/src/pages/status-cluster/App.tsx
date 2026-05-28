import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AdBlockerCounts } from '@vela/shared';
import { URLBAR_ICON_LABELS } from '@vela/shared';
import { IconContextMenu } from '../../components/AddressBar/IconContextMenu';
import { getGlassStyle } from '../../lib/popupGlass';

const params = new URLSearchParams(window.location.search);
const parentWindowId = parseInt(params.get('windowId') ?? '0', 10);

interface StatusState {
  pageFeatures: string[];
  activeTabId: string | null;
  currentUrl: string;
  visibleIcons?: Record<string, boolean>;
}

const rawState = params.get('state');
const state: StatusState = rawState
  ? (JSON.parse(rawState) as StatusState)
  : { pageFeatures: [], activeTabId: null, currentUrl: '', visibleIcons: {} };

const isWebUrl = (url: string) => {
  try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
};

const visible = (id: string) => state.visibleIcons?.[id] !== false;

const ITEM: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '8px 14px', border: 'none', background: 'transparent',
  color: 'var(--vela-fg)', fontSize: 13, width: '100%',
  textAlign: 'left', cursor: 'pointer', borderRadius: 6,
  transition: 'background 100ms',
};

function Item({ icon, label, badge, muted, onClick, onCtxMenu }: {
  icon: React.ReactNode;
  label: string;
  badge?: string | number;
  muted?: boolean;
  onClick: () => void;
  onCtxMenu?: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      style={{ ...ITEM, background: hovered ? 'var(--vela-bg-row-hover)' : 'transparent', opacity: muted ? 0.5 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      onContextMenu={onCtxMenu}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 16, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
        {label}
      </span>
      {badge !== undefined && (
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 10,
          background: 'color-mix(in srgb, var(--vela-accent) 20%, transparent)',
          color: 'var(--vela-accent)',
        }}>{badge}</span>
      )}
    </button>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 14px' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--vela-fg-muted)', fontSize: 12 }}>
        <span style={{ width: 16, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
        {label}
      </span>
      <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)' }}>{value}</span>
    </div>
  );
}

function relay(action: string, payload?: Record<string, unknown>) {
  void window.api.cluster.relayAction({ windowId: parentWindowId, action, clusterType: 'status', payload });
}

interface CtxMenu { x: number; y: number; iconId: string }

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    window.resizeTo(window.outerWidth, el.offsetHeight);
  });
  const [adCounts, setAdCounts] = useState<AdBlockerCounts | null>(null);
  const [adEnabled, setAdEnabled] = useState(false);
  const [adException, setAdException] = useState(false);
  const [cookieCount, setCookieCount] = useState(0);
  const [vaultCount, setVaultCount] = useState(0);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  const isWeb = isWebUrl(state.currentUrl);

  useEffect(() => {
    if (!isWeb || !state.activeTabId) return;
    void window.api.adblocker.getStatus({ tabId: state.activeTabId }).then((res) => {
      if (res.ok) {
        setAdEnabled(res.data.globalEnabled);
        setAdException(res.data.isException);
        setAdCounts(res.data.counts);
      }
    });

    try {
      void window.api.cookies.getForUrl(state.currentUrl).then((res) => {
        if (res.ok) setCookieCount(res.data.length);
      });
      const u = new URL(state.currentUrl);
      void window.api.vault.getForDomain({ domain: u.hostname }).then((res) => {
        if (res.ok) setVaultCount(res.data.length);
      });
    } catch { /* ignore */ }
  }, [isWeb]);

  const adTotal = adCounts ? adCounts.ads + adCounts.trackers + adCounts.other : 0;

  const featureLabel: Record<string, string> = { rss: 'Feed RSS', form: 'Formulario', media: 'Audio/Vídeo' };

  const openCtxMenu = (iconId: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, iconId });
  };

  return (
    <div ref={containerRef} style={{
      display: 'flex', flexDirection: 'column',
      background: 'var(--vela-bg-surface)',
      borderRadius: 10, border: '1px solid var(--vela-border)',
      overflow: 'hidden', fontSize: 13, color: 'var(--vela-fg)',
      padding: '6px 4px',
      ...getGlassStyle(),
    }}>
      {/* AdBlocker */}
      {isWeb && visible('adblocker') && (
        <Item
          icon={<ShieldIcon active={adEnabled && !adException} exception={adException} />}
          label={adEnabled && !adException ? 'Bloqueador activo' : adException ? 'Bloqueador desactivado (sitio)' : 'Bloqueador desactivado'}
          badge={adTotal > 0 ? adTotal : undefined}
          muted={!adEnabled || adException}
          onClick={() => relay('adblocker')}
          onCtxMenu={openCtxMenu('adblocker')}
        />
      )}

      {/* Cookies */}
      {isWeb && visible('cookie') && (
        <Item
          icon={<CookieIcon />}
          label="Cookies"
          badge={cookieCount > 0 ? cookieCount : undefined}
          onClick={() => relay('cookies')}
          onCtxMenu={openCtxMenu('cookie')}
        />
      )}

      {/* Vault */}
      {isWeb && visible('vault') && (
        <Item
          icon={<KeyIcon accent={vaultCount > 0} />}
          label="Contraseñas guardadas"
          badge={vaultCount > 0 ? vaultCount : undefined}
          onClick={() => relay('vault')}
          onCtxMenu={openCtxMenu('vault')}
        />
      )}

      {/* Page features — informational only */}
      {state.pageFeatures.length > 0 && visible('page-indicators') && (
        <>
          <div style={{ height: 1, background: 'var(--vela-border)', margin: '4px 10px' }} />
          {state.pageFeatures.map((f) => (
            <InfoRow key={f} icon={<FeatureIcon feature={f} />} label={featureLabel[f] ?? f} value="detectado" />
          ))}
        </>
      )}

      {ctxMenu && (
        <IconContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          iconLabel={URLBAR_ICON_LABELS[ctxMenu.iconId as keyof typeof URLBAR_ICON_LABELS] ?? ctxMenu.iconId}
          onHide={() => relay('hide-icon', { iconId: ctxMenu.iconId })}
          onSettings={() => relay('open-settings-urlbar')}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}

function ShieldIcon({ active, exception }: { active: boolean; exception: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={active && !exception ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {exception ? (
        <>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <line x1="9" y1="9" x2="15" y2="15" />
          <line x1="15" y1="9" x2="9" y2="15" />
        </>
      ) : (
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      )}
    </svg>
  );
}

function CookieIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
      <path d="M8.5 8.5v.01" /><path d="M16 15.5v.01" /><path d="M12 12v.01" />
    </svg>
  );
}

function KeyIcon({ accent }: { accent: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={accent ? 'var(--vela-accent)' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

function FeatureIcon({ feature }: { feature: string }) {
  if (feature === 'rss') return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" />
    </svg>
  );
  if (feature === 'media') return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

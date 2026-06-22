import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { URLBAR_ICON_LABELS } from '@vela/shared';
import { IconContextMenu } from '../../components/AddressBar/IconContextMenu';
import { getGlassStyle } from '../../lib/popupGlass';

const params = new URLSearchParams(window.location.search);
const parentWindowId = parseInt(params.get('windowId') ?? '0', 10);

interface ToolsState {
  isInReaderMode: boolean;
  isReadable: boolean;
  devtoolsActive: boolean;
  isAnchored: boolean;
  anchoredTabId: string | null;
  isSecureTab: boolean;
  isFavorite: boolean;
  favoriteId: string | null;
  activeTabId: string | null;
  currentUrl: string;
  pageTitle?: string;
  favicon?: string | null;
  visibleIcons?: Record<string, boolean>;
}

const rawState = params.get('state');
const state: ToolsState = rawState
  ? (JSON.parse(rawState) as ToolsState)
  : { isInReaderMode: false, isReadable: false, devtoolsActive: false, isAnchored: false, anchoredTabId: null, isSecureTab: false, isFavorite: false, favoriteId: null, activeTabId: null, currentUrl: '', visibleIcons: {} };

const visible = (id: string) => state.visibleIcons?.[id] !== false;

const isWebUrl = (url: string) => {
  try { const u = new URL(url); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
};

const ITEM: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '8px 14px', border: 'none', background: 'transparent',
  color: 'var(--vela-fg)', fontSize: 13, width: '100%',
  textAlign: 'left', cursor: 'pointer', borderRadius: 6,
  transition: 'background 100ms',
};

const ITEM_ACCENT: React.CSSProperties = { ...ITEM, color: 'var(--vela-accent)' };

interface CtxMenu { x: number; y: number; iconId: string }

function Item({ icon, label, accent, onClick, disabled, onCtxMenu }: {
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
  onClick: () => void;
  disabled?: boolean;
  onCtxMenu?: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      style={{ ...(accent ? ITEM_ACCENT : ITEM), background: hovered ? 'var(--vela-bg-row-hover)' : 'transparent', opacity: disabled ? 0.4 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      onContextMenu={onCtxMenu}
      disabled={disabled}
    >
      <span style={{ width: 16, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );
}

function relay(action: string, payload?: Record<string, unknown>) {
  void window.api.cluster.relayAction({ windowId: parentWindowId, action, clusterType: 'tools', payload });
}

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    window.resizeTo(window.outerWidth, el.offsetHeight);
  });
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  const handleAnchor = useCallback(() => {
    if (state.isAnchored && state.anchoredTabId) {
      void window.api.tab.unanchor({ id: state.anchoredTabId }).then(() => window.close());
    } else if (state.activeTabId) {
      void window.api.tab.anchor({ id: state.activeTabId }).then(() => window.close());
    }
  }, []);

  const handleFavorite = useCallback(() => {
    if (state.isFavorite && state.favoriteId) {
      void window.api.favorites.remove({ id: state.favoriteId }).then(() => window.close());
    } else {
      void window.api.favorites.add({ url: state.currentUrl, title: state.pageTitle ?? '', favicon: state.favicon ?? null, windowId: parentWindowId }).then(() => window.close());
    }
  }, []);

  const isWeb = isWebUrl(state.currentUrl);

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
      {/* Screenshot — no urlBarIconId, always visible */}
      {isWeb && (
        <Item icon={<CameraIcon />} label="Captura de pantalla" onClick={() => relay('screenshot-start')} />
      )}

      {/* Reader — only show when relevant, no urlBarIconId */}
      {(state.isInReaderMode || state.isReadable) && (
        <Item
          icon={<BookIcon />}
          label={state.isInReaderMode ? 'Salir del modo lectura' : 'Modo lectura'}
          accent={state.isInReaderMode}
          onClick={() => relay('reader')}
        />
      )}

      {/* Anchor — no urlBarIconId, always visible */}
      {isWeb && (
        <Item
          icon={<AnchorIcon filled={state.isAnchored} />}
          label={state.isAnchored ? 'Levar ancla' : 'Anclar'}
          accent={state.isAnchored}
          onClick={handleAnchor}
        />
      )}

      {/* Favorite — urlBarIconId: 'favorites' */}
      {isWeb && visible('favorites') && (
        <Item
          icon={<StarIcon filled={state.isFavorite} />}
          label={state.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
          accent={state.isFavorite}
          onClick={handleFavorite}
          onCtxMenu={openCtxMenu('favorites')}
        />
      )}

      {/* SecureTab — no urlBarIconId, always visible */}
      {isWeb && !state.isSecureTab && (
        <Item
          icon={<MaskIcon />}
          label="Abrir en pestaña fantasma"
          onClick={() => relay('secure-tab', { url: state.currentUrl })}
        />
      )}

      {/* DevMode — urlBarIconId: 'developer' */}
      {visible('developer') && (
        <Item
          icon={<CodeIcon />}
          label="Modo desarrollador"
          accent={state.devtoolsActive}
          onClick={() => relay('devmode')}
          onCtxMenu={openCtxMenu('developer')}
        />
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

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5.5 2.5 L6.5 1 H9.5 L10.5 2.5 H13.5 C14.05 2.5 14.5 2.95 14.5 3.5 V12 C14.5 12.55 14.05 13 13.5 13 H2.5 C1.95 13 1.5 12.55 1.5 12 V3.5 C1.5 2.95 1.95 2.5 2.5 2.5 Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function AnchorIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="5" r="3" />
      <line x1="12" y1="8" x2="12" y2="22" />
      <path d="M5 15h14" />
      <path d="M5 15C5 19.5 8.5 22 12 22" />
      <path d="M19 15C19 19.5 15.5 22 12 22" />
    </svg>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function MaskIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 10C2 6.5 6.5 4 12 4s10 2.5 10 6c-1.5 2.5-4.5 3-7 1.5-.5-.3-1-.5-1.5-.5h-3c-.5 0-1 .2-1.5.5C6.5 13 3.5 12.5 2 10z" />
      <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M10.5 15.5Q12 17 13.5 15.5" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

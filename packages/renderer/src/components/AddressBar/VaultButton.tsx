import { useCallback, useEffect, useRef, useState } from 'react';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { IPC_EVENTS, URLBAR_ICON_LABELS } from '@vela/shared';
import { useUrlBarStore } from '../../stores/urlBarStore';
import { IconContextMenu } from './IconContextMenu';

// Tracks domains that already received a first-visit highlight this session
const highlightedDomains = new Set<string>();

function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch { return false; }
}

function KeyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  );
}

interface Props {
  url: string;
  editing: boolean;
}

export function VaultButton({ url, editing }: Props) {
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabId = useRuntimeStore((s) =>
    currentWindowId !== null ? (s.activeTabIdByWindow[currentWindowId] ?? null) : null,
  );

  const [credCount, setCredCount] = useState(0);
  const [pendingCreds, setPendingCreds] = useState(false);
  const [recentMatch, setRecentMatch] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const isVisible = useUrlBarStore((s) => s.isVisible('vault'));
  const setVisible = useUrlBarStore((s) => s.setVisible);

  // Invalida las consultas de estado pendiente en vuelo: un evento push es
  // siempre más reciente que una respuesta pedida antes de que llegara.
  const pendingReqRef = useRef(0);

  // Single effect: resets + fetches on every URL change
  useEffect(() => {
    setRecentMatch(false);
    setCredCount(0);

    if (!isWebUrl(url)) {
      setPendingCreds(false);
      return;
    }

    let domain = '';
    try { domain = new URL(url).hostname; } catch { setPendingCreds(false); return; }
    if (!domain) { setPendingCreds(false); return; }

    void window.api.vault.countForDomain({ domain }).then((res) => {
      if (!res.ok) return;
      const { count } = res.data;
      setCredCount(count);
      if (count > 0 && !highlightedDomains.has(domain)) {
        highlightedDomains.add(domain);
        setRecentMatch(true);
      }
    });
  }, [url]);

  // La oferta de guardado nace justo con la navegación post-login, así que el
  // main es su fuente de verdad: se relee en cada cambio de URL o de pestaña en
  // lugar de depender solo del evento push, que llegaría durante ese cambio.
  useEffect(() => {
    if (currentWindowId === null) return;
    const reqId = ++pendingReqRef.current;
    void window.api.vault.getPending({ windowId: currentWindowId }).then((res) => {
      if (reqId !== pendingReqRef.current) return;
      const info = res.ok ? res.data : null;
      setPendingCreds(!!info && info.tabId === activeTabId);
    });
  }, [url, activeTabId, currentWindowId]);

  // Listen for newly detected credentials (form submit flow)
  useEffect(() => {
    const unsubPending = window.api.on(IPC_EVENTS.VAULT_CREDENTIALS_PENDING, (payload) => {
      if (payload.windowId !== currentWindowId) return;
      if (payload.tabId === activeTabId) {
        pendingReqRef.current++;
        setPendingCreds(true);
        return;
      }
      // El aviso puede adelantar al cambio de pestaña activa que el renderer
      // aún está procesando. En vez de descartarlo —un login SPA no cambia la
      // URL, así que no habría segunda oportunidad de releerlo— se confirma
      // contra el main, que es la fuente de verdad de la oferta pendiente.
      const reqId = ++pendingReqRef.current;
      void window.api.vault.getPending({ windowId: currentWindowId }).then((res) => {
        if (reqId !== pendingReqRef.current) return;
        const info = res.ok ? res.data : null;
        setPendingCreds(!!info);
      });
    });
    const unsubCleared = window.api.on(IPC_EVENTS.VAULT_PENDING_CLEARED, (payload) => {
      if (payload.windowId !== currentWindowId) return;
      pendingReqRef.current++;
      setPendingCreds(false);
    });
    return () => { unsubPending(); unsubCleared(); };
  }, [currentWindowId, activeTabId]);

  const handleClick = useCallback(async () => {
    if (currentWindowId === null) return;
    setRecentMatch(false);

    if (pendingCreds) {
      await window.api.vault.openPendingSaveModal({ windowId: currentWindowId });
      return;
    }

    if (credCount > 0 && activeTabId && btnRef.current) {
      let domain = '';
      try { domain = new URL(url).hostname; } catch { return; }
      const rect = btnRef.current.getBoundingClientRect();
      await window.api.vault.openAutofillModal({
        windowId: currentWindowId,
        tabId: activeTabId,
        domain,
        anchorRect: { right: rect.right, bottom: rect.bottom },
      });
    }
  }, [currentWindowId, activeTabId, url, credCount, pendingCreds]);

  // Visual priority: pending > recentMatch > hasCreds > none
  const hasCreds = credCount > 0;

  if (editing || !isWebUrl(url) || (!hasCreds && !pendingCreds) || !isVisible) return null;
  const active = pendingCreds || recentMatch;
  const color = pendingCreds
    ? 'var(--vela-accent)'
    : recentMatch
      ? 'var(--vela-fg)'
      : 'var(--vela-addressbar-fg-muted)';
  const opacity = active ? 1 : hasCreds ? 0.5 : 0.25;
  const cursor = (active || hasCreds) ? 'pointer' : 'default';

  const tooltip = pendingCreds
    ? 'Guardar credenciales detectadas'
    : recentMatch
      ? `Rellenar contraseña para ${(() => { try { return new URL(url).hostname; } catch { return ''; } })()}`
      : hasCreds
        ? `${credCount} contraseña${credCount === 1 ? '' : 's'} guardada${credCount === 1 ? '' : 's'}`
        : 'Sin contraseñas guardadas para este sitio';

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
    <button
      ref={btnRef}
      type="button"
      title={tooltip}
      aria-label={tooltip}
      onContextMenu={handleContextMenu}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20,
        border: 'none', borderRadius: 4,
        background: 'transparent', padding: 0, flexShrink: 0,
        position: 'relative',
        color,
        opacity,
        cursor,
        transition: 'opacity 200ms, color 200ms',
      }}
      onMouseEnter={(e) => {
        if (active || hasCreds)
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-bg-row-hover)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
      onClick={() => void handleClick()}
    >
      <KeyIcon />

      {/* Pulsing dot: pending (accent) or recentMatch (fg) */}
      {active && (
        <span aria-hidden style={{
          position: 'absolute', top: 1, right: 1,
          width: 5, height: 5, borderRadius: '50%',
          background: pendingCreds ? 'var(--vela-accent)' : 'var(--vela-fg)',
          animation: 'vela-pulse 1.5s ease-in-out infinite',
        }} />
      )}

      {/* Count badge: when creds exist but no active state */}
      {hasCreds && !active && (
        <span aria-hidden style={{
          position: 'absolute', top: -2, right: -3,
          minWidth: 9, height: 9, borderRadius: 5,
          background: 'var(--vela-fg-muted)', color: 'var(--vela-bg)',
          fontSize: 6, fontWeight: 700, lineHeight: '9px',
          textAlign: 'center', padding: '0 2px',
        }}>
          {credCount}
        </span>
      )}
    </button>
    {ctxMenu && (
      <IconContextMenu
        x={ctxMenu.x}
        y={ctxMenu.y}
        iconLabel={URLBAR_ICON_LABELS['vault']}
        onHide={() => void setVisible('vault', false)}
        onSettings={() => void window.api.window.openUrlInNewTab({ url: 'vela://settings#appearance' })}
        onClose={() => setCtxMenu(null)}
      />
    )}
    </>
  );
}

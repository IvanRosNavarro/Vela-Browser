import { useRef } from 'react';
import { useNotificationsStore } from '../../stores/notificationsStore';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useTreeStore } from '../../stores/treeStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';

function BellIcon({ muted }: { muted?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      {muted && <line x1="1" y1="1" x2="23" y2="23" />}
    </svg>
  );
}

export function NotificationBell() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabIdByWindow = useRuntimeStore((s) => s.activeTabIdByWindow);
  const activeTabId = currentWindowId !== null ? (activeTabIdByWindow[currentWindowId] ?? null) : null;

  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);
  const nodesByWorkspace = useTreeStore((s) => s.nodesByWorkspace);
  const nodes = activeWorkspaceId ? (nodesByWorkspace[activeWorkspaceId] ?? []) : [];
  const activeNode = nodes.find((n) => n.id === activeTabId);
  const activeTabUrl = activeNode?.kind === 'tab' ? activeNode.url : null;

  const activeOrigin = (() => {
    if (!activeTabUrl) return null;
    try { return new URL(activeTabUrl).origin; } catch { return null; }
  })();

  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const permissions = useNotificationsStore((s) => s.permissions);
  const pendingOrigins = useNotificationsStore((s) => s.pendingOrigins);
  const pushSubscriptions = useNotificationsStore((s) => s.pushSubscriptions);
  const openPanel = useNotificationsStore((s) => s.openPanel);
  const grantPermission = useNotificationsStore((s) => s.grantPermission);
  const denyPermission = useNotificationsStore((s) => s.denyPermission);

  const pendingInfo = activeOrigin
    ? pendingOrigins.find((p) => p.origin === activeOrigin)
    : null;

  const permEntry = activeOrigin
    ? permissions.find((p) => p.origin === activeOrigin)
    : null;

  const hasPushSub = activeOrigin
    ? pushSubscriptions.some((s) => s.origin === activeOrigin)
    : false;

  type BellState = 'none' | 'pending' | 'granted' | 'denied' | 'push-active';

  const bellState: BellState = (() => {
    if (pendingInfo) return 'pending';
    if (hasPushSub) return 'push-active';
    if (permEntry?.state === 'granted') return 'granted';
    if (permEntry?.state === 'denied') return 'denied';
    return 'none';
  })();

  if (bellState === 'none') return null;

  const colors: Record<BellState, string> = {
    none: 'var(--vela-fg-muted)',
    pending: '#f0a500',
    granted: 'var(--vela-fg)',
    denied: 'var(--vela-fg-muted)',
    'push-active': 'var(--vela-accent, #5b8ef4)',
  };

  const tooltips: Record<BellState, string> = {
    none: '',
    pending: 'Solicitud de notificaciones · Haz clic para decidir',
    granted: 'Notificaciones permitidas · Haz clic para ver el centro',
    denied: 'Notificaciones denegadas · Haz clic para ver el centro',
    'push-active': 'Notificaciones push activas · Haz clic para ver el centro',
  };

  const showBadge = (bellState === 'granted' || bellState === 'push-active') && unreadCount > 0;

  function handleClick() {
    if (bellState === 'pending' && pendingInfo && currentWindowId !== null && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      void window.api.notifications.openPermissionPopup({
        windowId: currentWindowId,
        origin: pendingInfo.origin,
        hasPushRequest: pendingInfo.hasPushRequest,
        anchorRect: { left: rect.left, bottom: rect.bottom },
      });
      return;
    }
    openPanel();
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      title={tooltips[bellState]}
      onClick={handleClick}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        borderRadius: 4,
        border: 'none',
        background: 'transparent',
        color: colors[bellState],
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
        opacity: bellState === 'denied' ? 0.45 : 1,
        animation: bellState === 'pending' ? 'vela-bell-pulse 1.6s ease-in-out infinite' : undefined,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.06))'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      <BellIcon muted={bellState === 'denied'} />
      {showBadge && (
        <span
          aria-label={`${unreadCount} notificaciones sin leer`}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            minWidth: 10,
            height: 10,
            borderRadius: 10,
            background: 'var(--vela-accent, #5b8ef4)',
            fontSize: 7,
            fontWeight: 700,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 2px',
            lineHeight: 1,
            pointerEvents: 'none',
          }}
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}

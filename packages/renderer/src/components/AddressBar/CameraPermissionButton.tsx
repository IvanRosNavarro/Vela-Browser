import { useRef } from 'react';
import { useMediaPermissionStore } from '../../stores/mediaPermissionStore';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useTreeStore } from '../../stores/treeStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function CameraOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 16v1a2 2 0 01-2 2H3a2 2 0 01-2-2V7a2 2 0 012-2h2m5.66 0H14a2 2 0 012 2v3.34l1 1L23 7v10" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export function CameraPermissionButton() {
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

  const permissions = useMediaPermissionStore((s) => s.permissions);
  const pendingOrigins = useMediaPermissionStore((s) => s.pendingOrigins);

  const pendingInfo = activeOrigin
    ? pendingOrigins.find((p) => p.origin === activeOrigin)
    : null;

  const permEntry = activeOrigin
    ? permissions.find((p) => p.origin === activeOrigin)
    : null;

  type CamState = 'none' | 'pending' | 'granted' | 'denied';

  const camState: CamState = (() => {
    if (pendingInfo) return 'pending';
    if (permEntry?.state === 'granted') return 'granted';
    if (permEntry?.state === 'denied') return 'denied';
    return 'none';
  })();

  if (camState === 'none') return null;

  const colors: Record<CamState, string> = {
    none: 'var(--vela-fg-muted)',
    pending: '#f0a500',
    granted: 'var(--vela-fg)',
    denied: 'var(--vela-fg-muted)',
  };

  const tooltips: Record<CamState, string> = {
    none: '',
    pending: 'Solicitud de cámara/micrófono · Haz clic para decidir',
    granted: 'Cámara/micrófono permitidos · Haz clic para revocar',
    denied: 'Cámara/micrófono denegados · Haz clic para cambiar',
  };

  function handleClick() {
    if (!buttonRef.current || currentWindowId === null || !activeOrigin) return;
    const rect = buttonRef.current.getBoundingClientRect();

    if (camState === 'pending' && pendingInfo) {
      void window.api.mediaPermission.openPermissionPopup({
        windowId: currentWindowId,
        origin: pendingInfo.origin,
        mediaTypes: pendingInfo.mediaTypes,
        anchorRect: { left: rect.left, bottom: rect.bottom },
      });
      return;
    }
    // granted / denied → abrir popup para que el usuario revoque o permita
    void window.api.mediaPermission.openPermissionPopup({
      windowId: currentWindowId,
      origin: activeOrigin,
      mediaTypes: ['video', 'audio'],
      anchorRect: { left: rect.left, bottom: rect.bottom },
    });
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      title={tooltips[camState]}
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
        color: colors[camState],
        cursor: 'pointer',
        padding: 0,
        flexShrink: 0,
        opacity: camState === 'denied' ? 0.45 : 1,
        animation: camState === 'pending' ? 'vela-bell-pulse 1.6s ease-in-out infinite' : undefined,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-hover, rgba(255,255,255,0.06))'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
    >
      {camState === 'denied' ? <CameraOffIcon /> : <CameraIcon />}
    </button>
  );
}

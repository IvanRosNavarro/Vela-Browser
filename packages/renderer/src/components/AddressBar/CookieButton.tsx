import { useEffect, useRef, useState } from 'react';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useTreeStore } from '../../stores/treeStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';
import { IPC_EVENTS } from '@vela/shared';

function CookieIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="8.5" cy="9" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="14" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1" fill="currentColor" stroke="none" />
      <line x1="12" y1="12" x2="12.5" y2="9.5" />
    </svg>
  );
}

export function CookieButton() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [cookieCount, setCookieCount] = useState(0);

  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabIdByWindow = useRuntimeStore((s) => s.activeTabIdByWindow);
  const activeTabId = currentWindowId ? (activeTabIdByWindow[currentWindowId] ?? null) : null;

  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);
  const nodesByWorkspace = useTreeStore((s) => s.nodesByWorkspace);
  const nodes = activeWorkspaceId ? (nodesByWorkspace[activeWorkspaceId] ?? []) : [];
  const activeNode = nodes.find((n) => n.id === activeTabId);
  const activeTabUrl = activeNode?.kind === 'tab' ? activeNode.url : null;

  async function loadCount(url: string) {
    try {
      const res = await window.api.cookies.getForUrl(url);
      if (res.ok) setCookieCount((res.data as { name: string }[]).length);
    } catch { /* noop */ }
  }

  useEffect(() => {
    if (!activeTabUrl || activeTabUrl.startsWith('vela://') || activeTabUrl === 'about:blank') {
      setCookieCount(0);
      return;
    }
    void loadCount(activeTabUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabUrl]);

  useEffect(() => {
    const unsub = window.api.on(IPC_EVENTS.COOKIES_CHANGED, ({ tabId }) => {
      if (tabId === activeTabId && activeTabUrl) {
        void loadCount(activeTabUrl);
      }
    });
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, activeTabUrl]);

  if (!activeTabUrl || activeTabUrl.startsWith('vela://') || activeTabUrl === 'about:blank') {
    return null;
  }

  const hasCookies = cookieCount > 0;
  const tooltip = hasCookies
    ? `${cookieCount} cookie${cookieCount > 1 ? 's' : ''} · Click para gestionar`
    : 'Sin cookies en esta página';

  function handleClick() {
    if (!currentWindowId || !activeTabUrl || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    void window.api.cookies.openPanel({
      windowId: currentWindowId,
      url: activeTabUrl,
      anchorRect: { right: rect.right, bottom: rect.bottom },
    });
  }

  return (
    <button
      ref={buttonRef}
      title={tooltip}
      onClick={handleClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, borderRadius: 4, border: 'none',
        background: 'transparent',
        color: 'var(--vela-fg-muted)',
        cursor: hasCookies ? 'pointer' : 'default',
        opacity: hasCookies ? 1 : 0.3,
        padding: 0, flexShrink: 0,
      }}
    >
      <CookieIcon />
    </button>
  );
}

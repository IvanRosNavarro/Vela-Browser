import { useCallback, useEffect, useRef, useState } from 'react';
import { useTreeStore } from '../../stores/treeStore';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';

const BTN_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  cursor: 'default',
  padding: 0,
  flexShrink: 0,
} as const;

function isAnchorableUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function AnchorIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="5" r="3" />
      <line x1="12" y1="8" x2="12" y2="22" />
      <path d="M5 15h14" />
      <path d="M5 15C5 19.5 8.5 22 12 22" />
      <path d="M19 15C19 19.5 15.5 22 12 22" />
    </svg>
  );
}

interface AnchorButtonProps {
  url: string;
  editing: boolean;
}

export function AnchorButton({ url, editing }: AnchorButtonProps) {
  const anchoredTabs = useTreeStore((s) => s.anchoredTabs);
  const isAnchor = anchoredTabs.some((t) => t.url === url);
  const anchoredTab = anchoredTabs.find((t) => t.url === url) ?? null;

  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabIdByWindow = useRuntimeStore((s) => s.activeTabIdByWindow);
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);
  const nodesByWorkspace = useTreeStore((s) => s.nodesByWorkspace);

  const [animating, setAnimating] = useState(false);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => { if (animTimerRef.current) clearTimeout(animTimerRef.current); },
    [],
  );

  const getActiveTabId = useCallback((): string | null => {
    if (currentWindowId === null) return null;
    return activeTabIdByWindow[currentWindowId] ?? null;
  }, [currentWindowId, activeTabIdByWindow]);

  const handleClick = useCallback(async () => {
    if (isAnchor) {
      if (anchoredTab) {
        await window.api.tab.unanchor({ id: anchoredTab.id });
        setAnimating(true);
        if (animTimerRef.current) clearTimeout(animTimerRef.current);
        animTimerRef.current = setTimeout(() => setAnimating(false), 300);
      }
    } else {
      const activeTabId = getActiveTabId();
      if (!activeTabId) return;
      // Verify the tab exists in current workspace nodes
      const nodes = activeWorkspaceId ? (nodesByWorkspace[activeWorkspaceId] ?? []) : [];
      const tabNode = nodes.find((n) => n.id === activeTabId && n.kind === 'tab');
      if (!tabNode) return;
      await window.api.tab.anchor({ id: activeTabId });
      setAnimating(true);
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      animTimerRef.current = setTimeout(() => setAnimating(false), 300);
    }
  }, [isAnchor, anchoredTab, getActiveTabId, activeWorkspaceId, nodesByWorkspace]);

  if (editing || !isAnchorableUrl(url)) return null;

  return (
    <button
      type="button"
      aria-label={isAnchor ? 'Levar Ancla' : 'Anclar Ancla'}
      title={isAnchor ? 'Levar Ancla' : 'Anclar Ancla'}
      style={{
        ...BTN_STYLE,
        color: isAnchor ? 'var(--vela-accent)' : 'var(--vela-addressbar-fg-muted)',
        opacity: isAnchor ? 1 : 0.4,
        transform: animating ? 'scale(1.3)' : 'scale(1)',
        transition: 'transform 200ms ease, opacity 150ms, color 150ms',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-bg-row-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      onClick={() => void handleClick()}
    >
      <AnchorIcon filled={isAnchor} />
    </button>
  );
}

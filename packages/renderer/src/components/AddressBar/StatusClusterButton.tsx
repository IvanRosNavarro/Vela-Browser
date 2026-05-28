import { useCallback, useEffect, useRef, useState } from 'react';
import { IPC_EVENTS } from '@vela/shared';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';
import { usePageFeatureStore } from '../../stores/pageFeatureStore';
import { clusterRegistry } from './clusterRegistry';
import { useUrlBarStore } from '../../stores/urlBarStore';

const BTN_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  border: 'none',
  borderRadius: 5,
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--vela-addressbar-fg-muted)',
  padding: 0,
  flexShrink: 0,
  position: 'relative' as const,
} as const;

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

interface Props {
  url: string;
  editing: boolean;
}

export function StatusClusterButton({ url, editing }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [blockedCount, setBlockedCount] = useState(0);

  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabId = useRuntimeStore((s) =>
    currentWindowId !== null ? (s.activeTabIdByWindow[currentWindowId] ?? null) : null,
  );
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);

  const pageFeatures = usePageFeatureStore((s) =>
    s.getFeaturesForTab(activeTabId ?? ''),
  );

  // Subscribe to live adblocker count updates for the badge
  useEffect(() => {
    if (!activeTabId) return;
    const unsub = window.api.on(IPC_EVENTS.ADBLOCKER_COUNT_UPDATED, (payload) => {
      if (payload.tabId === activeTabId) {
        setBlockedCount(payload.counts.ads + payload.counts.trackers + payload.counts.other);
      }
    });
    return unsub;
  }, [activeTabId]);

  useEffect(() => {
    clusterRegistry.registerStatus(() => btnRef.current?.getBoundingClientRect() ?? null);
    return () => clusterRegistry.unregisterStatus();
  }, []);

  const urlBarIsVisible = useUrlBarStore((s) => s.isVisible);

  const handleClick = useCallback(async () => {
    if (!btnRef.current || currentWindowId === null) return;
    const rect = btnRef.current.getBoundingClientRect();

    await window.api.cluster.openStatus({
      windowId: currentWindowId,
      anchorRect: { right: rect.right, bottom: rect.bottom },
      state: {
        pageFeatures,
        activeTabId,
        currentUrl: url,
        visibleIcons: {
          adblocker: urlBarIsVisible('adblocker'),
          cookie: urlBarIsVisible('cookie'),
          vault: urlBarIsVisible('vault'),
          'page-indicators': urlBarIsVisible('page-indicators'),
        },
      },
    });
  }, [currentWindowId, url, pageFeatures, activeTabId, activeWorkspaceId, urlBarIsVisible]);

  if (editing) return null;

  const hasBadge = blockedCount > 0;
  const badgeColor = 'var(--vela-accent)';

  return (
    <button
      ref={btnRef}
      type="button"
      title="Estado de página"
      style={BTN_STYLE}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-bg-row-hover)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--vela-fg)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--vela-addressbar-fg-muted)';
      }}
      onClick={() => void handleClick()}
    >
      <InfoIcon />
      {hasBadge && (
        <span style={{
          position: 'absolute',
          top: 1,
          right: 1,
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: badgeColor,
          pointerEvents: 'none',
        }} />
      )}
    </button>
  );
}

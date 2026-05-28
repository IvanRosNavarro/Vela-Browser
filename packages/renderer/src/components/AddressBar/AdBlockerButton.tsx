import { useCallback, useEffect, useRef, useState } from 'react';
import { useRuntimeStore } from '../../stores/runtimeStore';
import type { AdBlockerCounts } from '@vela/shared';
import { IPC_EVENTS } from '@vela/shared';

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

function isBlockableUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function ShieldIcon({ active, exception }: { active: boolean; exception: boolean }) {
  const color = exception ? 'var(--vela-fg-muted)' : active ? 'currentColor' : 'currentColor';
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill={active && !exception ? 'currentColor' : 'none'}
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
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

interface AdBlockerButtonProps {
  url: string;
  editing: boolean;
}

export function AdBlockerButton({ url, editing }: AdBlockerButtonProps) {
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabIdByWindow = useRuntimeStore((s) => s.activeTabIdByWindow);
  const activeTabId = currentWindowId !== null ? (activeTabIdByWindow[currentWindowId] ?? null) : null;

  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [isException, setIsException] = useState(false);
  const [counts, setCounts] = useState<AdBlockerCounts>({ ads: 0, trackers: 0, other: 0, blocked: [] });

  const btnRef = useRef<HTMLButtonElement>(null);

  const total = counts.ads + counts.trackers + counts.other;

  const fetchStatus = useCallback(async () => {
    if (!activeTabId || !isBlockableUrl(url)) return;
    const res = await window.api.adblocker.getStatus({ tabId: activeTabId });
    if (res.ok) {
      setGlobalEnabled(res.data.globalEnabled);
      setIsException(res.data.isException);
      setCounts(res.data.counts);
    }
  }, [activeTabId, url]);

  // Fetch status when tab or URL changes
  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Subscribe to live count updates
  useEffect(() => {
    if (!activeTabId) return;
    const unsub = window.api.on(IPC_EVENTS.ADBLOCKER_COUNT_UPDATED, (payload) => {
      if (payload.tabId === activeTabId) {
        setCounts(payload.counts);
      }
    });
    return unsub;
  }, [activeTabId]);

  const handleClick = useCallback(async () => {
    if (!activeTabId || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    await window.api.adblocker.openPanel({
      tabId: activeTabId,
      anchorRect: { right: rect.right, bottom: rect.bottom },
    });
  }, [activeTabId]);

  if (editing || !isBlockableUrl(url)) return null;

  const opacity = !globalEnabled ? 0.3 : isException ? 0.5 : 1.0;

  const tooltipText = !globalEnabled
    ? 'Bloqueador desactivado'
    : isException
      ? 'Bloqueador desactivado para este sitio'
      : total > 0
        ? `${total} elemento${total === 1 ? '' : 's'} bloqueado${total === 1 ? '' : 's'}`
        : 'Bloqueador activo';

  return (
    <button
      ref={btnRef}
      type="button"
      aria-label={tooltipText}
      title={tooltipText}
      style={{
        ...BTN_STYLE,
        color: isException ? 'var(--vela-fg-muted)' : 'var(--vela-addressbar-fg-muted)',
        opacity,
        transition: 'opacity 150ms',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-bg-row-hover)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
      onClick={() => void handleClick()}
    >
      <ShieldIcon active={globalEnabled && !isException} exception={isException} />
    </button>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';
import { selectNodeById, useTreeStore } from '../../stores/treeStore';
import { useDeviceEmulationStore } from '../../stores/deviceEmulationStore';
import type { UserScript } from '@vela/shared';

function CodeIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function matchesUrl(pattern: string, url: string): boolean {
  try {
    const re = new RegExp(
      '^' +
        pattern
          .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/, '.') +
        '$',
    );
    return re.test(url);
  } catch {
    return false;
  }
}

interface DevModeButtonProps {
  url: string;
  editing: boolean;
}

export function DevModeButton({ url, editing }: DevModeButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [scripts, setScripts] = useState<UserScript[]>([]);

  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabIdByWindow = useRuntimeStore((s) => s.activeTabIdByWindow);
  const activeTabId = currentWindowId !== null ? (activeTabIdByWindow[currentWindowId] ?? null) : null;

  const devtoolsActive = useDeviceEmulationStore((s) => s.active);

  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);
  const activeNode = useTreeStore((s) => {
    if (!activeWorkspaceId || !activeTabId) return null;
    return selectNodeById(s, activeWorkspaceId, activeTabId);
  });
  const currentUrl = activeNode?.kind === 'tab' ? (activeNode.url ?? '') : '';

  useEffect(() => {
    void window.api.scripts.list().then((res) => {
      if (res.ok) setScripts(res.data);
    });
  }, [currentUrl]);

  const activeCount = scripts.filter(
    (s) =>
      s.enabled &&
      s.matchPatterns.some((p) => matchesUrl(p, currentUrl)),
  ).length;

  const handleClick = useCallback(async () => {
    if (!btnRef.current || currentWindowId === null) return;
    const rect = btnRef.current.getBoundingClientRect();
    await window.api.devmode.openPopup({
      windowId: currentWindowId,
      activeTabId,
      currentUrl,
      devtoolsActive,
      anchorRect: { right: rect.right, bottom: rect.bottom },
    });
  }, [currentWindowId, activeTabId, currentUrl, devtoolsActive]);

  if (editing) return null;

  const tooltipText =
    activeCount > 0
      ? `${activeCount} script${activeCount > 1 ? 's' : ''} activo${activeCount > 1 ? 's' : ''} en esta página`
      : 'Herramientas de desarrollador';

  return (
    <button
      ref={btnRef}
      type="button"
      aria-label={tooltipText}
      title={tooltipText}
      onClick={() => void handleClick()}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, borderRadius: 4, border: 'none',
        background: 'transparent',
        color: activeCount > 0 ? 'var(--vela-accent)' : 'var(--vela-fg-muted)',
        cursor: 'pointer',
        opacity: activeCount > 0 ? 1 : 0.4,
        padding: 0, flexShrink: 0,
        transition: 'opacity 150ms, color 150ms',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-bg-row-hover)';
        (e.currentTarget as HTMLButtonElement).style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        (e.currentTarget as HTMLButtonElement).style.opacity = activeCount > 0 ? '1' : '0.4';
      }}
    >
      <CodeIcon active={activeCount > 0} />
    </button>
  );
}

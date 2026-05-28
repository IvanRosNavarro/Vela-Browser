import { useCallback, useEffect, useRef } from 'react';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useTreeStore, selectNodeById } from '../../stores/treeStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';
import { useReaderStore } from '../../stores/readerStore';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { useDeviceEmulationStore } from '../../stores/deviceEmulationStore';
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
  gap: 0,
} as const;

function WrenchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

interface Props {
  url: string;
  editing: boolean;
}

export function ToolsClusterButton({ url, editing }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabId = useRuntimeStore((s) =>
    currentWindowId !== null ? (s.activeTabIdByWindow[currentWindowId] ?? null) : null,
  );
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);

  const activeTabNode = useTreeStore((s) => {
    if (!activeWorkspaceId || !activeTabId) return null;
    return selectNodeById(s, activeWorkspaceId, activeTabId);
  });

  const anchoredTabs = useTreeStore((s) => s.anchoredTabs);
  const isAnchored = anchoredTabs.some((t) => t.url === url);
  const anchoredTab = anchoredTabs.find((t) => t.url === url) ?? null;

  const isReadable = useReaderStore((s) =>
    activeTabId ? (s.readableByTab[activeTabId] ?? false) : false,
  );
  const isInReaderMode = url.startsWith('vela://reader');
  const devtoolsActive = useDeviceEmulationStore((s) => s.active);
  const isFavorite = useFavoritesStore((s) => s.isFavorite(url));
  const getFavoriteForUrl = useFavoritesStore((s) => s.getForUrl);

  useEffect(() => {
    clusterRegistry.registerTools(() => btnRef.current?.getBoundingClientRect() ?? null);
    return () => clusterRegistry.unregisterTools();
  }, []);

  const urlBarIsVisible = useUrlBarStore((s) => s.isVisible);

  const handleClick = useCallback(async () => {
    if (!btnRef.current || currentWindowId === null) return;
    const rect = btnRef.current.getBoundingClientRect();
    const fav = isFavorite ? getFavoriteForUrl(url) : null;

    await window.api.cluster.openTools({
      windowId: currentWindowId,
      anchorRect: { right: rect.right, bottom: rect.bottom },
      state: {
        isInReaderMode,
        isReadable,
        devtoolsActive,
        isAnchored,
        anchoredTabId: anchoredTab?.id ?? null,
        isSecureTab: activeTabNode?.kind === 'tab' ? (activeTabNode.isSecure ?? false) : false,
        isFavorite,
        favoriteId: fav?.id ?? null,
        activeTabId,
        currentUrl: url,
        pageTitle: activeTabNode?.kind === 'tab' ? (activeTabNode.name || activeTabNode.originalTitle || '') : '',
        favicon: activeTabNode?.kind === 'tab' ? (activeTabNode.favicon ?? null) : null,
        visibleIcons: {
          favorites: urlBarIsVisible('favorites'),
          developer: urlBarIsVisible('developer'),
        },
      },
    });
  }, [currentWindowId, url, isAnchored, anchoredTab, isInReaderMode, isReadable, devtoolsActive, isFavorite, getFavoriteForUrl, activeTabId, activeTabNode, urlBarIsVisible]);

  if (editing) return null;

  return (
    <button
      ref={btnRef}
      type="button"
      title="Herramientas"
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
      <WrenchIcon />
    </button>
  );
}

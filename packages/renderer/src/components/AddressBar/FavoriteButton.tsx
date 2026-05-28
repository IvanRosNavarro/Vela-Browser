import { useCallback, useEffect, useRef, useState } from 'react';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useTreeStore } from '../../stores/treeStore';
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

function isBookmarkableUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function StarEmptyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function StarFilledIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

interface FavoriteButtonProps {
  url: string;
  editing: boolean;
}

export function FavoriteButton({ url, editing }: FavoriteButtonProps) {
  const isFavorite = useFavoritesStore((s) => s.isFavorite(url));
  const getForUrl = useFavoritesStore((s) => s.getForUrl);
  const addFavorite = useFavoritesStore((s) => s.add);
  const removeFavorite = useFavoritesStore((s) => s.remove);

  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabIdByWindow = useRuntimeStore((s) => s.activeTabIdByWindow);
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);
  const nodesByWorkspace = useTreeStore((s) => s.nodesByWorkspace);

  const [animating, setAnimating] = useState(false);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-render when favorites change (subscription already in store)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _favorites = useFavoritesStore((s) => s.favorites);

  useEffect(
    () => () => { if (animTimerRef.current) clearTimeout(animTimerRef.current); },
    [],
  );

  const getActiveTabNode = useCallback(() => {
    if (currentWindowId === null || !activeWorkspaceId) return null;
    const activeTabId = activeTabIdByWindow[currentWindowId] ?? null;
    if (!activeTabId) return null;
    const nodes = nodesByWorkspace[activeWorkspaceId] ?? [];
    return nodes.find((n) => n.id === activeTabId && n.kind === 'tab') ?? null;
  }, [currentWindowId, activeTabIdByWindow, activeWorkspaceId, nodesByWorkspace]);

  const handleClick = useCallback(async () => {
    if (isFavorite) {
      const fav = getForUrl(url);
      if (fav) {
        await removeFavorite(fav.id);
        setAnimating(true);
        if (animTimerRef.current) clearTimeout(animTimerRef.current);
        animTimerRef.current = setTimeout(() => setAnimating(false), 300);
      }
    } else {
      const node = getActiveTabNode();
      const title = node && node.kind === 'tab' ? (node.name || node.originalTitle || '') : '';
      const favicon = node && node.kind === 'tab' ? (node.favicon ?? null) : null;
      await addFavorite(url, title, favicon);
      setAnimating(true);
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      animTimerRef.current = setTimeout(() => setAnimating(false), 300);
    }
  }, [isFavorite, url, getForUrl, removeFavorite, addFavorite, getActiveTabNode]);

  if (editing || !isBookmarkableUrl(url)) return null;

  return (
    <button
      type="button"
      aria-label={isFavorite ? 'Eliminar de Favorites' : 'Añadir a Favorites'}
      title={isFavorite ? 'Eliminar de Favorites' : 'Añadir a Favorites'}
      style={{
        ...BTN_STYLE,
        color: isFavorite ? 'var(--vela-accent)' : 'var(--vela-addressbar-fg-muted)',
        opacity: isFavorite ? 1 : 0.4,
        transform: animating ? 'scale(1.3)' : 'scale(1)',
        transition: 'transform 200ms ease, opacity 150ms, color 150ms',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-bg-row-hover)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      onClick={() => void handleClick()}
    >
      {isFavorite ? <StarFilledIcon /> : <StarEmptyIcon />}
    </button>
  );
}

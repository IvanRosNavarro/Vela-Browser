import { useCallback } from 'react';
import { BookOpen } from 'lucide-react';
import { call } from '../../lib/ipc';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useReaderStore } from '../../stores/readerStore';
import { selectNodeById, useTreeStore } from '../../stores/treeStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';

interface Props {
  compact: boolean;
}

export function ReaderButton({ compact }: Props) {
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabId = useRuntimeStore((s) =>
    currentWindowId !== null ? (s.activeTabIdByWindow[currentWindowId] ?? null) : null,
  );
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);

  const activeTabUrl = useTreeStore((s) => {
    if (!activeTabId) return '';
    if (activeWorkspaceId) {
      const node = selectNodeById(s, activeWorkspaceId, activeTabId);
      if (node && node.kind === 'tab') return node.url;
    }
    const anchor = s.anchoredTabs.find((t) => t.id === activeTabId);
    return anchor ? anchor.url : '';
  });

  const readable = useReaderStore((s) =>
    activeTabId ? (s.readableByTab[activeTabId] ?? false) : false,
  );

  const isInReaderMode = activeTabUrl.startsWith('vela://reader');
  const showButton = isInReaderMode || readable;

  const handleClick = useCallback(() => {
    if (!activeTabId) return;
    if (isInReaderMode) {
      try {
        const params = new URLSearchParams(new URL(activeTabUrl).search);
        const sourceUrl = params.get('source');
        if (sourceUrl) {
          void call(() => window.api.nav.goto({ id: activeTabId, url: sourceUrl }));
        }
      } catch {
        // Malformed URL — ignore
      }
    } else if (readable) {
      const readerUrl = `vela://reader?source=${encodeURIComponent(activeTabUrl)}`;
      void call(() => window.api.window.openUrlInNewTab({ url: readerUrl }));
    }
  }, [activeTabId, activeTabUrl, isInReaderMode, readable]);

  if (!showButton) return null;

  const iconSize = compact ? 14 : 16;

  return (
    <button
      type="button"
      onClick={handleClick}
      title={isInReaderMode ? 'Salir del modo lectura' : 'Modo lectura'}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px',
        borderRadius: 4,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: isInReaderMode ? 'var(--vela-accent)' : 'var(--vela-fg-muted)',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--vela-fg)';
        (e.currentTarget as HTMLButtonElement).style.background =
          'var(--vela-bg-hover, rgba(127,127,127,0.12))';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = isInReaderMode
          ? 'var(--vela-accent)'
          : 'var(--vela-fg-muted)';
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      <BookOpen size={iconSize} strokeWidth={1.5} />
    </button>
  );
}

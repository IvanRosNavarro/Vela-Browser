import type { TabNode, TreeNode } from '@vela/shared';

interface Props {
  tabs: TreeNode[];
  onTabClick: (tabId: string) => void;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function TabList({ tabs, onTabClick }: Props) {
  const visible = tabs.slice(0, 5);
  const overflow = tabs.length - visible.length;

  if (tabs.length === 0) {
    return (
      <p className="py-2 text-xs text-[var(--vela-fg-muted)] italic">
        Sin pestañas abiertas
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {visible.map((node) => {
        const tab = node.kind === 'tab' ? node : null;
        if (!tab) return null;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabClick(tab.id)}
            className="flex w-full items-center gap-2 rounded px-1 py-1 text-left transition-colors hover:bg-[var(--vela-bg-surface-hover)]"
          >
            {tab.favicon ? (
              <img
                src={tab.favicon}
                alt=""
                className="h-3.5 w-3.5 flex-shrink-0 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="h-3.5 w-3.5 flex-shrink-0 rounded-sm bg-[var(--vela-border)]" />
            )}
            <span className="truncate text-xs text-[var(--vela-fg)]">
              {(tab.name ?? tab.originalTitle) || getDomain(tab.url) || 'Nueva pestaña'}
            </span>
          </button>
        );
      })}
      {overflow > 0 && (
        <p className="px-1 py-0.5 text-xs text-[var(--vela-fg-muted)]">
          y {overflow} más...
        </p>
      )}
    </div>
  );
}

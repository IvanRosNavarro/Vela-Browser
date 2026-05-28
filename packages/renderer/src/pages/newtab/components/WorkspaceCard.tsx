import type { Workspace, TreeNode } from '@vela/shared';
import { TabList } from './TabList';
import { QuickNotes } from './QuickNotes';

interface Props {
  workspace: Workspace;
  tabs: TreeNode[];
  isActive: boolean;
  onWorkspaceClick: (workspaceId: string) => void;
  onTabClick: (tabId: string, workspaceId: string) => void;
}

export function WorkspaceCard({ workspace, tabs, isActive, onWorkspaceClick, onTabClick }: Props) {
  const accentColor = workspace.color ?? 'var(--vela-accent)';

  return (
    <div
      className={`flex flex-col rounded-xl border bg-[var(--vela-bg-surface)] p-4 transition-shadow hover:shadow-md ${
        isActive
          ? 'border-[var(--vela-accent)] shadow-sm'
          : 'border-[var(--vela-border)]'
      }`}
      style={
        isActive
          ? { borderColor: accentColor, boxShadow: `0 0 0 1px ${accentColor}20` }
          : { borderTopWidth: '3px', borderTopColor: accentColor }
      }
    >
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        {workspace.icon && (
          <span className="text-base leading-none">{workspace.icon}</span>
        )}
        <button
          type="button"
          onClick={() => onWorkspaceClick(workspace.id)}
          className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-[var(--vela-fg)] hover:text-[var(--vela-accent)]"
        >
          {workspace.name}
        </button>
        <span className="flex-shrink-0 rounded-full bg-[var(--vela-bg)] px-2 py-0.5 text-xs text-[var(--vela-fg-muted)]">
          {tabs.filter((n) => n.kind === 'tab').length}
        </span>
      </div>

      {/* Tabs */}
      <TabList
        tabs={tabs}
        onTabClick={(tabId) => onTabClick(tabId, workspace.id)}
      />

      {/* Quick Notes */}
      <QuickNotes workspaceId={workspace.id} />
    </div>
  );
}

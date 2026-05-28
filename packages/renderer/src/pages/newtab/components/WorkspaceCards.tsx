import type { Workspace, TreeNode } from '@vela/shared';
import { WorkspaceCard } from './WorkspaceCard';

interface Props {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  nodesByWorkspace: Record<string, TreeNode[]>;
  onWorkspaceClick: (workspaceId: string) => void;
  onTabClick: (tabId: string, workspaceId: string) => void;
}

export function WorkspaceCards({
  workspaces,
  activeWorkspaceId,
  nodesByWorkspace,
  onWorkspaceClick,
  onTabClick,
}: Props) {
  if (workspaces.length === 0) return null;

  // Sort: active first, then by most recently used (position as proxy since
  // we don't have lastActivatedAt on Workspace type yet)
  const sorted = [...workspaces].sort((a, b) => {
    if (a.id === activeWorkspaceId) return -1;
    if (b.id === activeWorkspaceId) return 1;
    return 0;
  });

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', maxWidth: '960px', width: '100%' }}
    >
      {sorted.map((ws) => {
        const tabs = nodesByWorkspace[ws.id] ?? [];
        return (
          <WorkspaceCard
            key={ws.id}
            workspace={ws}
            tabs={tabs}
            isActive={ws.id === activeWorkspaceId}
            onWorkspaceClick={onWorkspaceClick}
            onTabClick={onTabClick}
          />
        );
      })}
    </div>
  );
}

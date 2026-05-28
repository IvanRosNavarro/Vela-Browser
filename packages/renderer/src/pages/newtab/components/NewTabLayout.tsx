import { useEffect, useState } from 'react';
import type { Workspace, TreeNode } from '@vela/shared';
import {
  SEARCH_SETTINGS_DEFAULTS,
  type SearchSettings,
  type SearchEngineId,
} from '@vela/shared';
import { call } from '../../../lib/ipc';
import { UnifiedSearch } from './UnifiedSearch';
import { WorkspaceCards } from './WorkspaceCards';
import { EmptyState } from './EmptyState';

export function NewTabLayout() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [nodesByWorkspace, setNodesByWorkspace] = useState<Record<string, TreeNode[]>>({});
  const [searchSettings, setSearchSettings] = useState<SearchSettings>(SEARCH_SETTINGS_DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const [wsRes, activeRes, settingsRes] = await Promise.all([
        window.api.workspaces.list(),
        window.api.workspaces.getActive(),
        window.api.settings.getAll({}),
      ]);

      const wsList = wsRes.ok ? wsRes.data : [];
      const activeId = activeRes.ok ? activeRes.data.id : null;

      setWorkspaces(wsList);
      setActiveWorkspaceId(activeId);

      if (settingsRes.ok) {
        const s = settingsRes.data;
        setSearchSettings({
          engine: (s['search:engine'] as SearchEngineId | undefined) ?? SEARCH_SETTINGS_DEFAULTS.engine,
          customUrl: (s['search:customUrl'] as string | undefined) ?? null,
        });
      }

      // Load trees for all workspaces in parallel
      const treeEntries = await Promise.all(
        wsList.map(async (ws) => {
          const res = await window.api.tree.getByWorkspace({ workspaceId: ws.id });
          const nodes = res.ok ? res.data : [];
          return [ws.id, nodes] as const;
        }),
      );
      setNodesByWorkspace(Object.fromEntries(treeEntries));
      setLoaded(true);
    }

    void load();
  }, []);

  async function handleWorkspaceClick(workspaceId: string) {
    await window.api.workspaces.setActive({ id: workspaceId });
  }

  async function handleTabClick(tabId: string, workspaceId: string) {
    // Switch workspace first if needed
    if (workspaceId !== activeWorkspaceId) {
      await window.api.workspaces.setActive({ id: workspaceId });
    }
    await window.api.tab.activate({ id: tabId });
  }

  const hasContent =
    workspaces.length > 0 ||
    Object.values(nodesByWorkspace).some((nodes) => nodes.some((n) => n.kind === 'tab'));

  return (
    <div className="flex min-h-screen flex-col items-center gap-10 bg-[var(--vela-bg-app)] px-6 py-12">
      <UnifiedSearch
        workspaces={workspaces}
        nodesByWorkspace={nodesByWorkspace}
        searchSettings={searchSettings}
      />

      {loaded && !hasContent && (
        <EmptyState />
      )}

      {loaded && hasContent && (
        <WorkspaceCards
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          nodesByWorkspace={nodesByWorkspace}
          onWorkspaceClick={(id) => void handleWorkspaceClick(id)}
          onTabClick={(tabId, wsId) => void handleTabClick(tabId, wsId)}
        />
      )}
    </div>
  );
}

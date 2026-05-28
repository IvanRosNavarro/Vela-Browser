import { useEffect, useState, useCallback, useRef } from 'react';
import type { Workspace } from '@vela/shared';
import type { HistorySearchEntry, HistorySession, DomainStat } from '@vela/shared';
import { HistorySidebar } from './HistorySidebar';
import { HistoryToolbar } from './HistoryToolbar';
import { HistoryContent } from './HistoryContent';
import { DomainView } from './DomainView';

export type HistoryView = 'all' | 'domain-list' | 'domain-detail';

export interface HistoryState {
  view: HistoryView;
  workspaceFilter: string | null;
  query: string;
  timeRange: 'today' | 'week' | 'month' | 'all';
  domainFilter: string | null;
}

function getTimeRange(range: HistoryState['timeRange']): { from?: number; to?: number } {
  const now = Date.now();
  const day = 86_400_000;
  switch (range) {
    case 'today': {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return { from: start.getTime(), to: now };
    }
    case 'week': return { from: now - 7 * day, to: now };
    case 'month': return { from: now - 30 * day, to: now };
    default: return {};
  }
}

export function HistoryLayout() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [entries, setEntries] = useState<HistorySearchEntry[]>([]);
  const [domainStats, setDomainStats] = useState<DomainStat[]>([]);
  const [workspaceCounts, setWorkspaceCounts] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [state, setState] = useState<HistoryState>({
    view: 'all',
    workspaceFilter: null,
    query: '',
    timeRange: 'all',
    domainFilter: null,
  });

  const workspacesRef = useRef<Workspace[]>([]);
  workspacesRef.current = workspaces;

  const loadEntries = useCallback(async (s: HistoryState) => {
    const { from, to } = getTimeRange(s.timeRange);
    const query = s.domainFilter ?? s.query;
    const res = await window.api.history.search({
      query,
      workspaceId: s.workspaceFilter ?? undefined,
      limit: 500,
      from,
      to,
    });
    if (res.ok) setEntries(res.data);
  }, []);

  const loadSessions = useCallback(async (workspaceId: string | null) => {
    const res = await window.api.history.getSessions({ workspaceId: workspaceId ?? undefined });
    if (res.ok) setSessions(res.data);
  }, []);

  const loadDomainStats = useCallback(async (workspaceId: string | null) => {
    const res = await window.api.history.getDomainStats({ workspaceId: workspaceId ?? undefined });
    if (res.ok) setDomainStats(res.data);
  }, []);

  const refreshWorkspaceCounts = useCallback(async (wsList: Workspace[]) => {
    const counts: Record<string, number> = {};
    await Promise.all(wsList.map(async (ws) => {
      const r = await window.api.history.getDomainStats({ workspaceId: ws.id });
      if (r.ok) counts[ws.id] = r.data.reduce((sum, d) => sum + d.visitCount, 0);
    }));
    setWorkspaceCounts(counts);
  }, []);

  // Initial load
  useEffect(() => {
    async function init() {
      const wsRes = await window.api.workspaces.list();
      const wsList = wsRes.ok ? wsRes.data : [];
      setWorkspaces(wsList);
      await refreshWorkspaceCounts(wsList);
      setLoaded(true);
    }
    void init();
  }, [refreshWorkspaceCounts]);

  // Reload data when state or workspaces change
  useEffect(() => {
    if (!loaded) return;
    void loadEntries(state);
    void loadSessions(state.workspaceFilter);
    void loadDomainStats(state.workspaceFilter);
  }, [state, loaded, loadEntries, loadSessions, loadDomainStats]);

  function updateState(patch: Partial<HistoryState>) {
    setState((prev) => ({ ...prev, ...patch }));
  }

  async function handleDeleteEntry(id: string) {
    await window.api.history.delete({ id });
    setEntries((prev) => prev.filter((e) => e.id !== id));
    void loadSessions(state.workspaceFilter);
  }

  async function handleDeleteDomain(domain: string) {
    await window.api.history.deleteDomain({ domain });
    setDomainStats((prev) => prev.filter((d) => d.domain !== domain));
    void loadEntries(state);
    void loadSessions(state.workspaceFilter);
    void refreshWorkspaceCounts(workspacesRef.current);
  }

  async function handleDeleteAll(workspaceId?: string) {
    await window.api.history.deleteAll({ workspaceId });
    setEntries([]);
    setSessions([]);
    void loadDomainStats(state.workspaceFilter);
    void refreshWorkspaceCounts(workspacesRef.current);
  }

  async function handleRestoreSession(session: HistorySession) {
    const res = await window.api.history.getForPeriod({
      from: session.startedAt,
      to: session.endedAt,
      workspaceId: state.workspaceFilter ?? undefined,
    });
    if (!res.ok) return;
    const urls = [...new Set(res.data.map((e) => e.url))];
    if (urls.length > 15) {
      if (!confirm(`¿Abrir ${urls.length} pestañas?`)) return;
    }
    for (const url of urls) {
      await window.api.window.openUrlInNewTab({ url });
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--vela-bg-app)] text-[var(--vela-fg)]">
      <HistorySidebar
        workspaces={workspaces}
        workspaceCounts={workspaceCounts}
        view={state.view}
        workspaceFilter={state.workspaceFilter}
        onViewChange={(view) => updateState({ view, domainFilter: null })}
        onWorkspaceFilter={(id) => updateState({ workspaceFilter: id, view: 'all', domainFilter: null })}
        onDeleteAll={handleDeleteAll}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <HistoryToolbar
          query={state.query}
          timeRange={state.timeRange}
          view={state.view}
          onQueryChange={(q) => updateState({ query: q })}
          onTimeRangeChange={(r) => updateState({ timeRange: r })}
        />
        {state.view === 'domain-list' ? (
          <DomainView
            stats={domainStats}
            workspaceFilter={state.workspaceFilter}
            query={state.query}
            onViewDomain={(domain) => updateState({ view: 'all', domainFilter: domain })}
            onDeleteDomain={handleDeleteDomain}
          />
        ) : (
          <HistoryContent
            entries={entries}
            sessions={sessions}
            domainFilter={state.domainFilter}
            onDeleteEntry={handleDeleteEntry}
            onRestoreSession={handleRestoreSession}
            onClearDomainFilter={() => updateState({ domainFilter: null, query: '' })}
          />
        )}
      </div>
    </div>
  );
}

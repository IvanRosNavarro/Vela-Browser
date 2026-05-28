export interface QuickNote {
  workspaceId: string;
  content: string;
  updatedAt: number;
}

export interface HistorySearchEntry {
  id: string;
  url: string;
  title: string;
  favicon: string | null;
  visitedAt: number;
  workspaceId: string;
  sessionId: string;
}

export interface HistorySession {
  sessionId: string;
  startedAt: number;
  endedAt: number;
  entryCount: number;
  workspaceIds: string[];
}

export interface DomainStat {
  domain: string;
  visitCount: number;
  lastVisitedAt: number;
  favicon: string | null;
}

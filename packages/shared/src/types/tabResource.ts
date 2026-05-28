export interface TabResource {
  tabId: string;
  title: string;
  favicon: string | null;
  workspaceName: string;
  workspaceColor: string | null;
  status: 'active' | 'discarded' | 'loading' | 'error';
  memoryRss: number;     // KB (residentSet)
  memoryShared: number;  // KB
  pid: number | null;
  url: string;
}

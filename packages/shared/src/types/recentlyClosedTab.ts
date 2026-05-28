export interface RecentlyClosedTab {
  tabId: string;
  url: string;
  title: string;
  favicon: string | null;
  workspaceId: string;
  closedAt: number;
}

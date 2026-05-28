import type { PanelId } from './layout';

export interface TabRuntime {
  id: string;
  webContentsViewId: number;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  panelId: PanelId | null;
}

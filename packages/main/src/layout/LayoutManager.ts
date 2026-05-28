import type { WindowLayout, PanelId } from '@vela/shared';
import type { TabManager } from '../tabs/TabManager';

export class LayoutManager {
  constructor(private readonly tabManager: TabManager) {}

  getLayout(windowId: number): WindowLayout {
    return this.tabManager.getWindowLayoutData(windowId);
  }

  async setSplit(
    windowId: number,
    mode: 'split-h' | 'split-v',
    tabIdForNewPanel?: string,
  ): Promise<WindowLayout> {
    return this.tabManager.setSplit(windowId, mode, tabIdForNewPanel);
  }

  async closeSplit(windowId: number): Promise<WindowLayout> {
    return this.tabManager.closeSplit(windowId);
  }

  setFocusedPanel(windowId: number, panelId: PanelId): void {
    this.tabManager.setFocusedPanel(windowId, panelId);
  }

  setSplitRatio(windowId: number, ratio: number): void {
    this.tabManager.setSplitRatio(windowId, ratio);
  }

  persistSplitRatio(windowId: number): void {
    this.tabManager.persistSplitRatio(windowId);
  }

  async openTabInUnfocusedPanel(windowId: number, tabId: string): Promise<void> {
    return this.tabManager.openTabInUnfocusedPanel(windowId, tabId);
  }

  recalculateBounds(windowId: number): void {
    this.tabManager.recalculateBounds(windowId);
  }

  restoreLayoutForWorkspace(windowId: number, workspaceId: string): void {
    this.tabManager.restoreLayoutForWorkspace(windowId, workspaceId);
  }
}

export type LayoutMode = 'single' | 'split-h' | 'split-v';
export type PanelId = 'left' | 'right' | 'top' | 'bottom';

export interface PanelState {
  panelId: PanelId;
  activeTabId: string | null;
}

export interface WindowLayout {
  mode: LayoutMode;
  panels: PanelState[];
  splitRatio: number;
  focusedPanelId: PanelId;
}

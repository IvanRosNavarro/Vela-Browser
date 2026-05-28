import { create } from 'zustand';
import type { ExtensionAction, ExtensionAnchorRect } from '@vela/shared';

interface ExtensionActionsState {
  actions: ExtensionAction[];
  loaded: boolean;
}

interface ExtensionActionsActions {
  hydrate(): Promise<void>;
  openPopup(extensionId: string, anchorRect: ExtensionAnchorRect): Promise<void>;
}

export const useExtensionActionsStore = create<
  ExtensionActionsState & ExtensionActionsActions
>((set) => ({
  actions: [],
  loaded: false,

  async hydrate() {
    const res = await window.api.extensions.getActions();
    if (res.ok) {
      set({ actions: res.data, loaded: true });
    }
  },

  async openPopup(extensionId, anchorRect) {
    await window.api.extensions.openPopup({ extensionId, anchorRect });
  },
}));

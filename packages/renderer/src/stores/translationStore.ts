import { create } from 'zustand';

export type TranslationStatus = 'neutral' | 'suggested' | 'translated';

interface TranslationState {
  statusByTab: Record<string, TranslationStatus>;
  setTabStatus: (tabId: string, status: TranslationStatus) => void;
  getTabStatus: (tabId: string) => TranslationStatus;
}

export const useTranslationStore = create<TranslationState>((set, get) => ({
  statusByTab: {},
  setTabStatus: (tabId, status) =>
    set((s) => ({ statusByTab: { ...s.statusByTab, [tabId]: status } })),
  getTabStatus: (tabId) => get().statusByTab[tabId] ?? 'neutral',
}));

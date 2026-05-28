import { create } from 'zustand';

export type PageFeature = 'rss' | 'form' | 'media';

interface PageFeatureStoreState {
  featuresByTab: Record<string, PageFeature[]>;
  setFeatures(tabId: string, features: PageFeature[]): void;
  clearTab(tabId: string): void;
  getFeaturesForTab(tabId: string): PageFeature[];
}

export const usePageFeatureStore = create<PageFeatureStoreState>((set, get) => ({
  featuresByTab: {},
  setFeatures(tabId, features) {
    set((s) => ({ featuresByTab: { ...s.featuresByTab, [tabId]: features } }));
  },
  clearTab(tabId) {
    set((s) => {
      const next = { ...s.featuresByTab };
      delete next[tabId];
      return { featuresByTab: next };
    });
  },
  getFeaturesForTab(tabId) {
    return get().featuresByTab[tabId] ?? [];
  },
}));

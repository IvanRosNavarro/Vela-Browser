export interface AdBlockerCounts {
  ads: number;
  trackers: number;
  other: number;
  blocked: Array<{ url: string; rule: string }>;
}

export interface AdBlockerStatus {
  globalEnabled: boolean;
  isException: boolean;
  domain: string | null;
  counts: AdBlockerCounts;
  lastUpdated: number | null;
}

export type AnalyticsProvider =
  | 'ga4'
  | 'gtm'
  | 'fb-pixel'
  | 'google-ads'
  | 'tiktok'
  | 'linkedin'
  | 'pinterest'
  | 'hotjar'
  | 'mixpanel'
  | 'segment'
  | 'amplitude'
  | 'twitter'
  | 'datalayer'
  | 'other';

export interface AnalyticsHit {
  id: string;
  timestamp: number;
  provider: AnalyticsProvider;
  label: string;
  url: string;
  method: string;
  statusCode: number | null;
  params: Record<string, string>;
  rawData?: unknown;
}

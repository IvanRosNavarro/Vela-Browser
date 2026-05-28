export type AparejoId = 'adblocker' | 'cookies' | 'analytics-debugger';

export interface AparejoStatus {
  id: AparejoId;
  enabled: boolean;
  name: string;
  description: string;
  icon: string;
}

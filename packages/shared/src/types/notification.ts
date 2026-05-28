export interface StoredNotification {
  id: string;
  origin: string;
  title: string;
  body: string;
  icon: string | null;
  timestamp: number;
  read: boolean;
  tabId: string | null;
  profileId: string;
  source: 'web' | 'push';
}

export type NotificationPermissionState =
  | 'none'
  | 'pending'
  | 'granted'
  | 'denied'
  | 'push-active';

export type SilenceRuleType = 'schedule' | 'workspace' | 'temporary';

export interface SilenceRuleSchedule {
  type: 'schedule';
  from: string; // 'HH:MM'
  to: string;   // 'HH:MM'
}

export interface SilenceRuleWorkspace {
  type: 'workspace';
  workspaceId: string;
}

export interface SilenceRuleTemporary {
  type: 'temporary';
  until: number; // timestamp
}

export type SilenceRule =
  | SilenceRuleSchedule
  | SilenceRuleWorkspace
  | SilenceRuleTemporary;

export interface PushSubscriptionInfo {
  id: string;
  origin: string;
  endpoint: string;
  createdAt: number;
  lastPushAt: number | null;
}

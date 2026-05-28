export type AutoGroupRuleMatchType = 'domain' | 'regex' | 'title-contains';

export interface AutoGroupRule {
  id: string;
  workspaceId: string;
  pattern: string;
  matchType: AutoGroupRuleMatchType;
  targetFolderId: string;
  priority: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

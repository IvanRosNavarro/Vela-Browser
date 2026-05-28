import { z } from 'zod';

export const autoGroupRuleMatchTypeSchema = z.enum([
  'domain',
  'regex',
  'title-contains',
]);

export const autoGroupRuleSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  pattern: z.string().min(1).max(500),
  matchType: autoGroupRuleMatchTypeSchema,
  targetFolderId: z.string().min(1),
  priority: z.number().int(),
  enabled: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const ruleListInputSchema = z.object({
  workspaceId: z.string().min(1),
});

export const ruleCreateInputSchema = z.object({
  workspaceId: z.string().min(1),
  pattern: z.string().min(1).max(500),
  matchType: autoGroupRuleMatchTypeSchema,
  targetFolderId: z.string().min(1),
  enabled: z.boolean().optional(),
});

export const ruleUpdateInputSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1).max(500).optional(),
  matchType: autoGroupRuleMatchTypeSchema.optional(),
  targetFolderId: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

export const ruleDeleteInputSchema = z.object({
  id: z.string().min(1),
});

export const ruleReorderPriorityInputSchema = z.object({
  workspaceId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1),
});

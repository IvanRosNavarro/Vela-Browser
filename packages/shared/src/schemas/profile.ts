import { z } from 'zod';

export const profileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  position: z.string().min(1),
  partitionId: z.string().min(1),
  hasMasterPassword: z.boolean(),
  passwordHint: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  archived: z.boolean(),
  lastUsedAt: z.number().int().nonnegative().nullable(),
});

export const createProfileInputSchema = z.object({
  name: z.string().min(1).max(120),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  position: z.string().min(1).optional(),
  masterPassword: z.string().min(1).optional(),
  passwordHint: z.string().nullable().optional(),
});

export const updateProfileInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  passwordHint: z.string().nullable().optional(),
});

export const unlockProfileInputSchema = z.object({
  id: z.string().min(1),
  masterPassword: z.string().min(1).optional(),
});

export const profileReorderInputSchema = z.object({
  id: z.string().min(1),
  newPosition: z.string().min(1),
});

export const profileArchiveInputSchema = z.object({
  id: z.string().min(1),
  archived: z.boolean(),
});

export const profileDeleteInputSchema = z.object({
  id: z.string().min(1),
});

export const profileLockInputSchema = z.object({
  id: z.string().min(1),
});

export const profileSetMasterPasswordInputSchema = z.object({
  id: z.string().min(1),
  masterPassword: z.string().min(1),
  hint: z.string().nullable().optional(),
  currentMasterPassword: z.string().min(1).optional(),
});

export const profileRemoveMasterPasswordInputSchema = z.object({
  id: z.string().min(1),
  currentMasterPassword: z.string().min(1),
});

export const profileOpenWindowInputSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
  withSecureTab: z.boolean().optional(),
});

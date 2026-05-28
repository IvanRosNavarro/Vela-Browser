import { z } from 'zod';

export const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  position: z.string().min(1),
  archived: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export const workspaceCreateInputSchema = z.object({
  name: z.string().min(1).max(120),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  position: z.string().min(1).optional(),
});

export const workspaceUpdateInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

export const workspaceReorderInputSchema = z.object({
  id: z.string().min(1),
  newPosition: z.string().min(1),
});

export const workspaceArchiveInputSchema = z.object({
  id: z.string().min(1),
  archived: z.boolean(),
});

export const workspaceDeleteInputSchema = z.object({
  id: z.string().min(1),
});

export const workspaceSetActiveInputSchema = z.object({
  id: z.string().min(1),
  sourceWindowId: z.number().int().optional(),
});

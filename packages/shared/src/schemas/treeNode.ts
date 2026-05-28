import { z } from 'zod';

const treeNodeBaseShape = {
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  parentId: z.string().min(1).nullable(),
  position: z.string().min(1),
  name: z.string().nullable(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
};

export const folderNodeSchema = z.object({
  ...treeNodeBaseShape,
  kind: z.literal('folder'),
  collapsed: z.boolean(),
});

const tabNodeObjectSchema = z.object({
  ...treeNodeBaseShape,
  kind: z.literal('tab'),
  collapsed: z.boolean(),
  url: z.string().url(),
  originalTitle: z.string(),
  favicon: z.string().nullable(),
  pinned: z.boolean(),
  discarded: z.boolean(),
  lastActiveAt: z.number().int().nonnegative().nullable(),
});

const pinnedAtRoot = (node: { pinned: boolean; parentId: string | null }) =>
  !node.pinned || node.parentId === null;

const pinnedAtRootMessage =
  'Pinned tabs must live at the workspace root (parentId === null).';

export const tabNodeSchema = tabNodeObjectSchema.refine(pinnedAtRoot, {
  message: pinnedAtRootMessage,
  path: ['pinned'],
});

export const treeNodeSchema = z
  .discriminatedUnion('kind', [folderNodeSchema, tabNodeObjectSchema])
  .superRefine((node, ctx) => {
    if (node.kind === 'tab' && !pinnedAtRoot(node)) {
      ctx.addIssue({
        code: 'custom',
        message: pinnedAtRootMessage,
        path: ['pinned'],
      });
    }
  });

export const folderCreateInputSchema = z.object({
  workspaceId: z.string().min(1),
  parentId: z.string().min(1).nullable(),
  name: z.string().min(1).max(200),
  position: z.string().min(1).optional(),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  collapsed: z.boolean().optional(),
});

export const folderTabCreateInputSchema = z.object({
  workspaceId: z.string().min(1),
  parentId: z.string().min(1).nullable(),
  name: z.string().min(1).max(200),
  position: z.string().min(1).optional(),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
});

export const tabCreateInputSchema = z
  .object({
    workspaceId: z.string().min(1),
    parentId: z.string().min(1).nullable(),
    url: z.string().url(),
    originalTitle: z.string().optional(),
    favicon: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    position: z.string().min(1).optional(),
    color: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    pinned: z.boolean().optional(),
    discarded: z.boolean().optional(),
  })
  .refine((input) => !input.pinned || input.parentId === null, {
    message: pinnedAtRootMessage,
    path: ['pinned'],
  });

export const nodeUpdateInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  url: z.string().url().optional(),
  originalTitle: z.string().optional(),
  favicon: z.string().nullable().optional(),
  collapsed: z.boolean().optional(),
});

export const nodeDeleteInputSchema = z.object({
  id: z.string().min(1),
  cascade: z.boolean().optional(),
});

export const nodeMoveInputSchema = z.object({
  id: z.string().min(1),
  newParentId: z.string().min(1).nullable(),
  newPosition: z.string().min(1),
  newWorkspaceId: z.string().min(1).optional(),
});

export const nodeReorderInputSchema = z.object({
  id: z.string().min(1),
  newPosition: z.string().min(1),
});

export const nodeToggleCollapseInputSchema = z.object({
  id: z.string().min(1),
  collapsed: z.boolean().optional(),
});

export const nodeRenameInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable(),
});

export const tabActivateInputSchema = z.object({
  id: z.string().min(1),
});

export const tabSimpleInputSchema = z.object({
  id: z.string().min(1),
});

export const navGotoInputSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
});

export const navSimpleInputSchema = z.object({
  id: z.string().min(1),
});

export const treeGetByWorkspaceInputSchema = z.object({
  workspaceId: z.string().min(1),
});

export const treeNodeIdInputSchema = z.object({
  id: z.string().min(1),
});

export const windowOpenUrlInNewTabInputSchema = z.object({
  url: z.string().url(),
  parentId: z.string().min(1).nullable().optional(),
  activate: z.boolean().optional(),
});

export const layoutSidebarWidthInputSchema = z.object({
  width: z.number().int().nonnegative().max(2000),
});

export const layoutSetOverlayInputSchema = z.object({
  active: z.boolean(),
});

export const layoutSetAddressBarHeightInputSchema = z.object({
  height: z.number().int().nonnegative().max(200),
});

export const layoutSetNotificationPanelWidthInputSchema = z.object({
  width: z.number().int().nonnegative().max(1000),
});

export const runtimeGetTabNavStateInputSchema = z.object({
  tabId: z.string().min(1),
});

export const discardTabIdInputSchema = z.object({
  tabId: z.string().min(1),
});

export const discardFolderIdInputSchema = z.object({
  folderId: z.string().min(1),
});

export const discardWorkspaceIdInputSchema = z.object({
  workspaceId: z.string().min(1),
});

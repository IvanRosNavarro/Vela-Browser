import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  folderCreateInputSchema,
  folderTabCreateInputSchema,
  nodeDeleteInputSchema,
  nodeMoveInputSchema,
  nodeRenameInputSchema,
  nodeReorderInputSchema,
  nodeToggleCollapseInputSchema,
  nodeUpdateInputSchema,
  tabCreateInputSchema,
  type FolderNode,
  type IpcResponse,
  type TabNode,
  type TreeNode,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getReposForFrame, getFrameContext } from './helpers';

export function registerNodeHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.NODE_CREATE_FOLDER,
    async (event, payload): Promise<IpcResponse<FolderNode>> => {
      const parsed = folderCreateInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const folder = repos.treeNodes.createFolder(parsed.data);
        ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
          workspaceId: folder.workspaceId,
        });
        return { ok: true, data: folder };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NODE_CREATE_FOLDER);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.NODE_CREATE_FOLDER_TAB,
    async (event, payload): Promise<IpcResponse<TabNode>> => {
      const parsed = folderTabCreateInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const tab = repos.treeNodes.createFolderTab(parsed.data);
        ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
          workspaceId: tab.workspaceId,
        });
        return { ok: true, data: tab };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NODE_CREATE_FOLDER_TAB);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.NODE_CREATE_TAB,
    async (event, payload): Promise<IpcResponse<TabNode>> => {
      const parsed = tabCreateInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const tab = repos.treeNodes.createTab(parsed.data);
        ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
          workspaceId: tab.workspaceId,
        });
        return { ok: true, data: tab };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NODE_CREATE_TAB);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.NODE_UPDATE,
    async (event, payload): Promise<IpcResponse<TreeNode>> => {
      const parsed = nodeUpdateInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const { id, ...patch } = parsed.data;
        const node = repos.treeNodes.update(id, patch);
        ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
          workspaceId: node.workspaceId,
        });
        return { ok: true, data: node };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NODE_UPDATE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.NODE_DELETE,
    async (event, payload): Promise<IpcResponse<{ id: string }>> => {
      const parsed = nodeDeleteInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const { profileId, repos } = getFrameContext(event, ctx);
        const before = repos.treeNodes.getById(parsed.data.id);
        const mode = parsed.data.cascade === false ? 'promote-children' : 'subtree';
        repos.treeNodes.delete(parsed.data.id, mode);
        if (before) {
          ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
            workspaceId: before.workspaceId,
          });
          const mayAffectAnchors =
            (before.kind === 'tab' && before.anchored) ||
            (before.kind === 'folder' && parsed.data.cascade !== false);
          if (mayAffectAnchors) {
            ctx.events.emit(IPC_EVENTS.ANCHORED_TABS_CHANGED, {
              profileId,
              tabs: repos.treeNodes.listAnchored(),
            });
          }
        }
        return { ok: true, data: { id: parsed.data.id } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NODE_DELETE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.NODE_MOVE,
    async (event, payload): Promise<IpcResponse<TreeNode>> => {
      const parsed = nodeMoveInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const before = repos.treeNodes.getById(parsed.data.id);
        const result = repos.treeNodes.move(
          parsed.data.id,
          parsed.data.newParentId,
          parsed.data.newPosition,
          parsed.data.newWorkspaceId,
        );
        ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
          workspaceId: result.node.workspaceId,
        });
        if (before && before.workspaceId !== result.node.workspaceId) {
          ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
            workspaceId: before.workspaceId,
          });
        }
        return { ok: true, data: result.node };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NODE_MOVE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.NODE_REORDER,
    async (event, payload): Promise<IpcResponse<TreeNode>> => {
      const parsed = nodeReorderInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const node = repos.treeNodes.reorder(
          parsed.data.id,
          parsed.data.newPosition,
        );
        ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
          workspaceId: node.workspaceId,
        });
        return { ok: true, data: node };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NODE_REORDER);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.NODE_TOGGLE_COLLAPSE,
    async (event, payload): Promise<IpcResponse<TreeNode>> => {
      const parsed = nodeToggleCollapseInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        let node: TreeNode;
        if (parsed.data.collapsed === undefined) {
          node = repos.treeNodes.toggleCollapse(parsed.data.id);
        } else {
          node = repos.treeNodes.update(parsed.data.id, {
            collapsed: parsed.data.collapsed,
          });
        }
        ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
          workspaceId: node.workspaceId,
        });
        return { ok: true, data: node };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NODE_TOGGLE_COLLAPSE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.NODE_RENAME,
    async (event, payload): Promise<IpcResponse<TreeNode>> => {
      const parsed = nodeRenameInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const node = repos.treeNodes.update(parsed.data.id, {
          name: parsed.data.name,
        });
        ctx.events.emit(IPC_EVENTS.TREE_CHANGED, {
          workspaceId: node.workspaceId,
        });
        return { ok: true, data: node };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NODE_RENAME);
      }
    },
  );
}

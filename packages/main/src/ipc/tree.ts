import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  treeGetByWorkspaceInputSchema,
  treeNodeIdInputSchema,
  type IpcResponse,
  type TreeNode,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getReposForFrame } from './helpers';

export function registerTreeHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.TREE_GET_BY_WORKSPACE,
    async (event, payload): Promise<IpcResponse<TreeNode[]>> => {
      const parsed = treeGetByWorkspaceInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const nodes = repos.treeNodes.getByWorkspace(parsed.data.workspaceId);
        return { ok: true, data: nodes };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TREE_GET_BY_WORKSPACE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TREE_GET_DESCENDANTS,
    async (event, payload): Promise<IpcResponse<TreeNode[]>> => {
      const parsed = treeNodeIdInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const nodes = repos.treeNodes.getDescendants(parsed.data.id);
        return { ok: true, data: nodes };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TREE_GET_DESCENDANTS);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TREE_GET_ANCESTORS,
    async (event, payload): Promise<IpcResponse<TreeNode[]>> => {
      const parsed = treeNodeIdInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const nodes = repos.treeNodes.getAncestors(parsed.data.id);
        return { ok: true, data: nodes };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TREE_GET_ANCESTORS);
      }
    },
  );
}

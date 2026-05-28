import { ipcMain } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS, z, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { getFrameContext } from './helpers';
import { mapError } from './errors';
import { PreviewStore } from '../previews/PreviewStore';

const previewsExistsInputSchema = z.object({ tabId: z.string().min(1) });
const mruConfirmInputSchema = z.object({ tabId: z.string().min(1) });

export function registerPreviewHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.PREVIEWS_EXISTS,
    async (event, payload): Promise<IpcResponse<{ exists: boolean }>> => {
      const parsed = previewsExistsInputSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const { profileId } = getFrameContext(event, ctx);
        const store = new PreviewStore(profileId);
        const exists = await store.exists(parsed.data.tabId);
        return { ok: true, data: { exists } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.PREVIEWS_EXISTS);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.MRU_CONFIRM,
    async (event, payload): Promise<IpcResponse<void>> => {
      const parsed = mruConfirmInputSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const { windowId, repos } = getFrameContext(event, ctx);
        const node = repos.treeNodes.getById(parsed.data.tabId);
        if (!node || node.kind !== 'tab') {
          return { ok: false, error: 'NOT_FOUND', details: `Tab ${parsed.data.tabId} not found` };
        }
        const currentWorkspaceId = ctx.tabManager.getWorkspaceForWindow(windowId);
        if (node.workspaceId !== currentWorkspaceId) {
          repos.metadata.set('active-workspace', node.workspaceId);
          ctx.tabManager.setWorkspaceForWindow(windowId, node.workspaceId);
          ctx.events.emit(IPC_EVENTS.ACTIVE_WORKSPACE_CHANGED, {
            windowId,
            workspaceId: node.workspaceId,
          });
        }
        await ctx.tabManager.activateTab(windowId, node.id);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MRU_CONFIRM);
      }
    },
  );
}

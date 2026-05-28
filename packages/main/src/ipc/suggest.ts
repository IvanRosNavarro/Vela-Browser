import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  suggestQueryInputSchema,
  type IpcResponse,
  type Suggestion,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getReposForFrame } from './helpers';

const DEFAULT_LIMIT = 8;

export function registerSuggestHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.SUGGEST_QUERY,
    async (event, payload): Promise<IpcResponse<Suggestion[]>> => {
      const parsed = suggestQueryInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const query = parsed.data.query.trim();
        if (query.length === 0) {
          return { ok: true, data: [] };
        }
        const limit = parsed.data.limit ?? DEFAULT_LIMIT;
        const repos = getReposForFrame(event, ctx);
        const matches = repos.treeNodes.searchTabs(query, limit);
        const data: Suggestion[] = matches.map(({ tab, workspaceName }) => ({
          type: 'open-tab',
          tabId: tab.id,
          workspaceId: tab.workspaceId,
          workspaceName,
          title: tab.name ?? tab.originalTitle,
          url: tab.url,
          favicon: tab.favicon,
        }));
        return { ok: true, data };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SUGGEST_QUERY);
      }
    },
  );
}

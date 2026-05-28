import { ipcMain, app } from 'electron';
import { IPC_CHANNELS, z, type IpcResponse, type TabResource } from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getReposForFrame } from './helpers';
import { guardTrustedFrame } from './validate';

export function registerResourcesHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.RESOURCES_GET_ALL,
    async (event, payload): Promise<IpcResponse<TabResource[]>> => {
      guardTrustedFrame(event, IPC_CHANNELS.RESOURCES_GET_ALL);
      const parsed = z.object({ profileId: z.string() }).safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const workspaces = repos.workspaces.list();
        const results: TabResource[] = [];

        // Build PID → workingSetSize map from app metrics (synchronous, no await).
        const metricsByPid = new Map(
          app.getAppMetrics().map((m) => [m.pid, m.memory.workingSetSize]),
        );

        for (const ws of workspaces) {
          const nodes = repos.treeNodes.getByWorkspace(ws.id);
          for (const node of nodes) {
            if (node.kind !== 'tab') continue;
            const wcv = ctx.tabManager.getWcvForTab(node.id);
            if (!wcv || wcv.webContents.isDestroyed()) {
              results.push({
                tabId: node.id,
                title: node.name ?? node.originalTitle,
                favicon: node.favicon,
                workspaceName: ws.name,
                workspaceColor: ws.color,
                status: 'discarded',
                memoryRss: 0,
                memoryShared: 0,
                pid: null,
                url: node.url,
              });
              continue;
            }
            const pid = wcv.webContents.getOSProcessId();
            const memoryRss = metricsByPid.get(pid) ?? 0;
            results.push({
              tabId: node.id,
              title: node.name ?? node.originalTitle,
              favicon: node.favicon,
              workspaceName: ws.name,
              workspaceColor: ws.color,
              status: wcv.webContents.isLoading() ? 'loading' : 'active',
              memoryRss,
              memoryShared: 0,
              pid,
              url: node.url,
            });
          }
        }

        results.sort((a, b) => b.memoryRss - a.memoryRss);
        return { ok: true, data: results };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.RESOURCES_GET_ALL);
      }
    },
  );
}

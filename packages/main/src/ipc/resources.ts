import { ipcMain, app, webContents, type WebContents } from 'electron';
import {
  IPC_CHANNELS,
  z,
  type IpcResponse,
  type ResourcesSnapshot,
  type SystemProcessKind,
  type SystemProcessResource,
  type TabResource,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getReposForFrame } from './helpers';
import { guardTrustedFrame } from './validate';

/** Metadatos de los WebContents que viven en un mismo proceso de renderer. */
interface RendererOccupant {
  type: string;
  title: string;
  url: string;
}

function kindForMetricType(type: string): SystemProcessKind {
  switch (type) {
    case 'Browser':
      return 'browser';
    case 'GPU':
      return 'gpu';
    case 'Utility':
      return 'utility';
    case 'Tab':
      return 'renderer';
    default:
      return 'other';
  }
}

/**
 * Agrupa los WebContents vivos por PID. Permite ponerle nombre a los renderers
 * que no son pestañas del perfil actual (la shell, popups, páginas de
 * extensión, pestañas blindadas, pestañas de otras ventanas o perfiles).
 */
function collectRendererOccupants(): Map<number, RendererOccupant[]> {
  const byPid = new Map<number, RendererOccupant[]>();
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed()) continue;
    let pid: number;
    try {
      pid = wc.getOSProcessId();
    } catch {
      continue;
    }
    if (!pid) continue;
    const list = byPid.get(pid);
    const occupant = describeWebContents(wc);
    if (list) list.push(occupant);
    else byPid.set(pid, [occupant]);
  }
  return byPid;
}

function describeWebContents(wc: WebContents): RendererOccupant {
  let title = '';
  let url = '';
  try {
    title = wc.getTitle();
  } catch { /* destruido entre medias */ }
  try {
    url = wc.getURL();
  } catch { /* destruido entre medias */ }
  return { type: wc.getType(), title, url };
}

/** Nombre legible para un renderer que no es pestaña del perfil actual. */
function nameRenderer(occupants: RendererOccupant[] | undefined): { name: string; detail: string | null } {
  if (!occupants || occupants.length === 0) {
    return { name: 'Renderer sin WebContents', detail: 'Proceso vivo sin contenido asociado' };
  }

  const first = occupants[0]!;
  const extra = occupants.length > 1 ? ` (+${occupants.length - 1})` : '';

  if (first.url.startsWith('chrome-extension://')) {
    return { name: `Extensión: ${first.title || 'sin título'}${extra}`, detail: first.url };
  }
  if (first.url.startsWith('vela://')) {
    const page = first.url.slice('vela://'.length).split(/[?#]/)[0] || 'shell';
    return { name: `Interfaz de Vela: ${page}${extra}`, detail: first.url };
  }
  if (first.type === 'window') {
    return { name: `Ventana de Vela${extra}`, detail: first.url || null };
  }
  return {
    name: `${first.title || 'Contenido web'}${extra}`,
    detail: first.url || null,
  };
}

function nameProcess(
  type: string,
  serviceName: string | undefined,
  metricName: string | undefined,
  occupants: RendererOccupant[] | undefined,
): { name: string; detail: string | null } {
  switch (type) {
    case 'Browser':
      return { name: 'Proceso principal', detail: 'Lógica de Vela, SQLite e IPC' };
    case 'GPU':
      return { name: 'GPU', detail: 'Composición y aceleración gráfica' };
    case 'Utility':
      return { name: metricName || serviceName || 'Utility', detail: serviceName ?? null };
    case 'Tab':
      return nameRenderer(occupants);
    default:
      return { name: metricName || type, detail: null };
  }
}

export function registerResourcesHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.RESOURCES_GET_ALL,
    async (event, payload): Promise<IpcResponse<ResourcesSnapshot>> => {
      guardTrustedFrame(event, IPC_CHANNELS.RESOURCES_GET_ALL);
      const parsed = z.object({ profileId: z.string() }).safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const workspaces = repos.workspaces.list();
        const tabs: TabResource[] = [];

        // Métricas de TODOS los procesos de la app, no solo de las pestañas.
        const metrics = app.getAppMetrics();
        const metricsByPid = new Map(metrics.map((m) => [m.pid, m]));

        /** PIDs ya representados por una fila de pestaña. */
        const claimedPids = new Set<number>();

        for (const ws of workspaces) {
          const nodes = repos.treeNodes.getByWorkspace(ws.id);
          for (const node of nodes) {
            if (node.kind !== 'tab') continue;
            const wcv = ctx.tabManager.getWcvForTab(node.id);
            if (!wcv || wcv.webContents.isDestroyed()) {
              tabs.push({
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
                memoryKnown: true, // suspendida: 0 MB es el valor real
              });
              continue;
            }
            const pid = wcv.webContents.getOSProcessId();
            const metric = metricsByPid.get(pid);
            if (pid) claimedPids.add(pid);
            tabs.push({
              tabId: node.id,
              title: node.name ?? node.originalTitle,
              favicon: node.favicon,
              workspaceName: ws.name,
              workspaceColor: ws.color,
              status: wcv.webContents.isLoading() ? 'loading' : 'active',
              memoryRss: metric?.memory.workingSetSize ?? 0,
              memoryShared: 0,
              pid: pid || null,
              url: node.url,
              memoryKnown: metric !== undefined,
            });
          }
        }

        // Todo proceso de la app que ninguna pestaña haya reclamado.
        const occupantsByPid = collectRendererOccupants();
        const otherProcesses: SystemProcessResource[] = [];
        let totalMemoryRss = 0;

        for (const metric of metrics) {
          totalMemoryRss += metric.memory.workingSetSize;
          if (claimedPids.has(metric.pid)) continue;
          const { name, detail } = nameProcess(
            metric.type,
            metric.serviceName,
            metric.name,
            occupantsByPid.get(metric.pid),
          );
          otherProcesses.push({
            pid: metric.pid,
            kind: kindForMetricType(metric.type),
            name,
            detail,
            memoryRss: metric.memory.workingSetSize,
          });
        }

        tabs.sort((a, b) => b.memoryRss - a.memoryRss);
        otherProcesses.sort((a, b) => b.memoryRss - a.memoryRss);

        return {
          ok: true,
          data: { tabs, otherProcesses, totalMemoryRss, processCount: metrics.length },
        };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.RESOURCES_GET_ALL);
      }
    },
  );
}

import { BrowserWindow, ipcMain } from 'electron';
import {
  z,
  IPC_CHANNELS,
  IPC_EVENTS,
  type AparejoStatus,
  type IpcResponse,
} from '@vela/shared';
import type { IpcContext } from './context';
import { getFrameContext } from './helpers';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';

const APAREJO_META: Record<string, { name: string; description: string; icon: string }> = {
  adblocker: {
    name: 'Bloqueador de anuncios',
    description: 'Motor de filtrado de red nativo.',
    icon: 'ti-shield',
  },
  cookies: {
    name: 'Editor de cookies',
    description: 'Gestión de cookies en la URL bar.',
    icon: 'ti-cookie',
  },
  'analytics-debugger': {
    name: 'Analytics Debugger',
    description: 'Captura y depura eventos de analytics en tiempo real.',
    icon: 'ti-chart-bar',
  },
};

function buildStatus(
  id: 'adblocker' | 'cookies' | 'analytics-debugger',
  settingsRepo: { get(k: string): string | null },
): AparejoStatus {
  const raw = settingsRepo.get(`aparejo:${id}:enabled`);
  const enabled = raw === null ? true : JSON.parse(raw) as boolean;
  const meta = APAREJO_META[id]!;
  return { id, enabled, ...meta };
}

function broadcastAparejos(aparejos: AparejoStatus[], windowId: number): void {
  const win = BrowserWindow.fromId(windowId);
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_EVENTS.APAREJOS_CHANGED, { aparejos });
  }
}

export function registerAparejoHandlers(ctx: IpcContext): void {
  // ── aparejos:get-all ─────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.APAREJOS_GET_ALL,
    async (event): Promise<IpcResponse<AparejoStatus[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.APAREJOS_GET_ALL);
        const { repos } = getFrameContext(event, ctx);
        const aparejos: AparejoStatus[] = [
          buildStatus('adblocker', repos.settings),
          buildStatus('cookies', repos.settings),
          buildStatus('analytics-debugger', repos.settings),
        ];
        return { ok: true, data: aparejos };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.APAREJOS_GET_ALL);
      }
    },
  );

  // ── aparejos:set ─────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.APAREJOS_SET,
    async (event, payload): Promise<IpcResponse<AparejoStatus[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.APAREJOS_SET);
        const parsed = z.object({
          id: z.enum(['adblocker', 'cookies', 'analytics-debugger']),
          enabled: z.boolean(),
        }).safeParse(payload);
        if (!parsed.success) {
          return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
        }

        const { id, enabled } = parsed.data;
        const { windowId, profileId, repos } = getFrameContext(event, ctx);

        repos.settings.set(`aparejo:${id}:enabled`, JSON.stringify(enabled));

        if (id === 'adblocker') {
          if (enabled) {
            const session = ctx.profileManager.getSession(profileId);
            await ctx.adBlockerManager.attach(
              profileId,
              session,
              repos.settings,
              repos.adBlockerExceptions,
            );
          } else {
            ctx.adBlockerManager.detach(profileId);
          }
        }

        const aparejos: AparejoStatus[] = [
          buildStatus('adblocker', repos.settings),
          buildStatus('cookies', repos.settings),
          buildStatus('analytics-debugger', repos.settings),
        ];

        broadcastAparejos(aparejos, windowId);

        return { ok: true, data: aparejos };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.APAREJOS_SET);
      }
    },
  );
}

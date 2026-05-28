import { BrowserWindow, ipcMain } from 'electron';
import {
  z,
  IPC_CHANNELS,
  IPC_EVENTS,
  DEFAULT_TITLEBAR_CONFIG,
  type TitleBarIconConfig,
  type IpcResponse,
} from '@vela/shared';
import type { IpcContext } from './context';
import { getFrameContext } from './helpers';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';

function loadConfig(settingsRepo: { get(k: string): string | null }): TitleBarIconConfig[] {
  try {
    const raw = settingsRepo.get('titlebar:icon-visibility');
    if (raw) {
      const parsed = JSON.parse(raw) as TitleBarIconConfig[];
      // Merge with defaults so new icons added in future versions appear
      const map = new Map(parsed.map((c) => [c.id, c]));
      return DEFAULT_TITLEBAR_CONFIG.map((def) => map.get(def.id) ?? def);
    }
  } catch { /* usar default */ }
  return DEFAULT_TITLEBAR_CONFIG;
}

function broadcastConfig(config: TitleBarIconConfig[], windowId: number): void {
  const win = BrowserWindow.fromId(windowId);
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_EVENTS.TITLEBAR_CONFIG_CHANGED, { config });
  }
}

const titleBarIconConfigSchema = z.object({
  id: z.enum(['favorites', 'media', 'windows', 'sync', 'split-view', 'device-mode']),
  visible: z.boolean(),
});

export function registerTitleBarHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.TITLEBAR_GET_CONFIG,
    async (event): Promise<IpcResponse<TitleBarIconConfig[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.TITLEBAR_GET_CONFIG);
        const { repos } = getFrameContext(event, ctx);
        return { ok: true, data: loadConfig(repos.settings) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TITLEBAR_GET_CONFIG);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TITLEBAR_SET_CONFIG,
    async (event, payload): Promise<IpcResponse<TitleBarIconConfig[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.TITLEBAR_SET_CONFIG);
        const parsed = z.object({ config: z.array(titleBarIconConfigSchema) }).safeParse(payload);
        if (!parsed.success) {
          return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
        }

        const { windowId, repos } = getFrameContext(event, ctx);
        repos.settings.set('titlebar:icon-visibility', JSON.stringify(parsed.data.config));
        broadcastConfig(parsed.data.config, windowId);

        return { ok: true, data: parsed.data.config };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TITLEBAR_SET_CONFIG);
      }
    },
  );
}

import { BrowserWindow, ipcMain } from 'electron';
import {
  z,
  IPC_CHANNELS,
  IPC_EVENTS,
  DEFAULT_URLBAR_CONFIG,
  URLBAR_ICON_IDS,
  type UrlBarIconConfig,
  type IpcResponse,
} from '@vela/shared';
import type { IpcContext } from './context';
import { getFrameContext } from './helpers';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';

function loadConfig(settingsRepo: { get(k: string): string | null }): UrlBarIconConfig[] {
  try {
    const raw = settingsRepo.get('urlbar:icon-config');
    if (raw) return withNewDefaults(JSON.parse(raw) as UrlBarIconConfig[]);
  } catch { /* usar default */ }
  return DEFAULT_URLBAR_CONFIG;
}

/**
 * Una configuración guardada antes de que existiera un icono no lo lista, y
 * el configurador de Ajustes solo pinta lo guardado. Se añaden los que falten
 * con su valor por defecto (al final, por su posición por defecto).
 */
function withNewDefaults(stored: UrlBarIconConfig[]): UrlBarIconConfig[] {
  const known = new Set(stored.map((c) => c.id));
  const missing = DEFAULT_URLBAR_CONFIG.filter((c) => !known.has(c.id));
  return missing.length === 0 ? stored : [...stored, ...missing];
}

function broadcastConfig(config: UrlBarIconConfig[], windowId: number): void {
  const win = BrowserWindow.fromId(windowId);
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_EVENTS.URLBAR_CONFIG_CHANGED, { config });
  }
}

const urlBarIconConfigSchema = z.object({
  id: z.enum(URLBAR_ICON_IDS),
  visible: z.boolean(),
  position: z.string(),
});

export function registerUrlBarHandlers(ctx: IpcContext): void {
  // ── urlbar:get-config ─────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.URLBAR_GET_CONFIG,
    async (event): Promise<IpcResponse<UrlBarIconConfig[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.URLBAR_GET_CONFIG);
        const { repos } = getFrameContext(event, ctx);
        return { ok: true, data: loadConfig(repos.settings) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.URLBAR_GET_CONFIG);
      }
    },
  );

  // ── urlbar:set-config ─────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.URLBAR_SET_CONFIG,
    async (event, payload): Promise<IpcResponse<UrlBarIconConfig[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.URLBAR_SET_CONFIG);
        const parsed = z.object({ config: z.array(urlBarIconConfigSchema) }).safeParse(payload);
        if (!parsed.success) {
          return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
        }

        const { windowId, repos } = getFrameContext(event, ctx);
        repos.settings.set('urlbar:icon-config', JSON.stringify(parsed.data.config));
        broadcastConfig(parsed.data.config, windowId);

        return { ok: true, data: parsed.data.config };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.URLBAR_SET_CONFIG);
      }
    },
  );
}

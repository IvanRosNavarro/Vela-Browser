import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  z,
  type IpcResponse,
  type CustomEngineAlias,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getReposForFrame } from './helpers';

const CUSTOM_ENGINES_KEY = 'search:custom-engines';

const setEngineSchema = z.object({
  alias: z.string().regex(/^!/).max(50),
  name: z.string().min(1).max(100),
  url: z.string().max(2048).refine((v) => v.includes('%s'), {
    message: 'La URL debe contener %s',
  }),
});

const deleteEngineSchema = z.object({
  alias: z.string().min(1).max(50),
});

function parseEngines(raw: string | null): CustomEngineAlias[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is CustomEngineAlias =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as CustomEngineAlias).alias === 'string' &&
        typeof (e as CustomEngineAlias).name === 'string' &&
        typeof (e as CustomEngineAlias).url === 'string',
    );
  } catch {
    return [];
  }
}

export function registerSearchEnginesHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.SEARCH_GET_ENGINES,
    async (event): Promise<IpcResponse<CustomEngineAlias[]>> => {
      try {
        const repos = getReposForFrame(event, ctx);
        const raw = repos.settings.get(CUSTOM_ENGINES_KEY);
        return { ok: true, data: parseEngines(raw) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SEARCH_GET_ENGINES);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SEARCH_SET_ENGINE,
    async (event, payload): Promise<IpcResponse<CustomEngineAlias[]>> => {
      const parsed = setEngineSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const engine = parsed.data;
        const repos = getReposForFrame(event, ctx);
        const existing = parseEngines(repos.settings.get(CUSTOM_ENGINES_KEY));
        const idx = existing.findIndex((e) => e.alias.toLowerCase() === engine.alias.toLowerCase());
        if (idx >= 0) {
          existing[idx] = engine;
        } else {
          existing.push(engine);
        }
        repos.settings.set(CUSTOM_ENGINES_KEY, JSON.stringify(existing));
        return { ok: true, data: existing };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SEARCH_SET_ENGINE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SEARCH_DELETE_ENGINE,
    async (event, payload): Promise<IpcResponse<CustomEngineAlias[]>> => {
      const parsed = deleteEngineSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const existing = parseEngines(repos.settings.get(CUSTOM_ENGINES_KEY));
        const updated = existing.filter(
          (e) => e.alias.toLowerCase() !== parsed.data.alias.toLowerCase(),
        );
        repos.settings.set(CUSTOM_ENGINES_KEY, JSON.stringify(updated));
        return { ok: true, data: updated };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SEARCH_DELETE_ENGINE);
      }
    },
  );
}

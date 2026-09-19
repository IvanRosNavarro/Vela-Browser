import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  SETTINGS_DEFAULT_SCOPE,
  SETTINGS_KEYS,
  settingsGetAllInputSchema,
  settingsGetInputSchema,
  settingsSetInputSchema,
  spellcheckGetInfoInputSchema,
  spellcheckLanguagesValueSchema,
  type IpcResponse,
  type SettingsKey,
  type SettingsScope,
  type SpellcheckInfo,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getFrameContext, getReposForFrame } from './helpers';
import { guardTrustedFrame } from './validate';
import { GlobalSettings, ProfileSettings, type SettingsStore } from '../settings';
import {
  applySpellcheckForProfile,
  getSpellcheckInfo,
  isSpellcheckSettingKey,
  watchSpellcheckSync,
} from '../spellcheck';

/**
 * Resuelve el scope efectivo: el caller puede forzar uno explícito o, por
 * defecto, usamos el mapa SETTINGS_DEFAULT_SCOPE. Las claves no listadas
 * caen a 'profile' como decisión por defecto del Prompt 6.
 */
function resolveScope(
  key: SettingsKey,
  override: SettingsScope | undefined,
): SettingsScope {
  if (override) return override;
  return SETTINGS_DEFAULT_SCOPE[key] ?? 'profile';
}

function storeFor(
  ctx: IpcContext,
  event: IpcMainInvokeEvent,
  scope: SettingsScope,
): SettingsStore {
  if (scope === 'global') {
    return new GlobalSettings(ctx.repositories.appMetadata);
  }
  const repos = getReposForFrame(event, ctx);
  return new ProfileSettings(repos.settings);
}

const UI_SETTING_PREFIX = 'ui:';

export function registerSettingsHandlers(ctx: IpcContext): void {
  watchSpellcheckSync(ctx.profileManager);

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET,
    async (event, payload): Promise<IpcResponse<{ value: unknown }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.SETTINGS_GET);
      const parsed = settingsGetInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const scope = resolveScope(parsed.data.key, parsed.data.scope);
        const store = storeFor(ctx, event, scope);
        return { ok: true, data: { value: store.get(parsed.data.key) } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SETTINGS_GET);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_SET,
    async (event, payload): Promise<IpcResponse<{ key: SettingsKey }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.SETTINGS_SET);
      const parsed = settingsSetInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      if (
        parsed.data.key === 'spellcheck:languages' &&
        !spellcheckLanguagesValueSchema.safeParse(parsed.data.value).success
      ) {
        return { ok: false, error: 'INVALID_INPUT' };
      }
      try {
        const scope = resolveScope(parsed.data.key, parsed.data.scope);
        const store = storeFor(ctx, event, scope);
        store.set(parsed.data.key, parsed.data.value);
        if (parsed.data.key.startsWith(UI_SETTING_PREFIX)) {
          ctx.events.emit(IPC_EVENTS.UI_SETTINGS_CHANGED, {
            key: parsed.data.key,
            value: parsed.data.value,
          });
        }
        if (parsed.data.key === 'workspaces:switch-modifier') {
          ctx.events.emit(IPC_EVENTS.SHORTCUTS_SYSTEM_CHANGED);
        }
        if (parsed.data.key === 'gestures:pinch-zoom') {
          ctx.trackpadGestures.applyPinchZoomToAll();
        }
        if (
          parsed.data.key.startsWith('darkmode:') ||
          parsed.data.key === 'ui:theme' ||
          parsed.data.key === 'ui:custom-themes'
        ) {
          // Modo oscuro de las webs: ajustes y tema de Vela en caliente.
          ctx.darkMode.refreshAll();
        }
        if (scope === 'profile' && isSpellcheckSettingKey(parsed.data.key)) {
          const { profileId } = getFrameContext(event, ctx);
          applySpellcheckForProfile(ctx.profileManager, profileId);
        }
        return { ok: true, data: { key: parsed.data.key } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SETTINGS_SET);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SETTINGS_GET_ALL,
    async (event, payload): Promise<IpcResponse<Record<SettingsKey, unknown>>> => {
      guardTrustedFrame(event, IPC_CHANNELS.SETTINGS_GET_ALL);
      const parsed = settingsGetAllInputSchema.safeParse(payload ?? {});
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const out = {} as Record<SettingsKey, unknown>;
        for (const key of SETTINGS_KEYS) {
          const scope = resolveScope(key, parsed.data.scope);
          const store = storeFor(ctx, event, scope);
          out[key] = store.get(key);
        }
        return { ok: true, data: out };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SETTINGS_GET_ALL);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SPELLCHECK_GET_INFO,
    async (event, payload): Promise<IpcResponse<SpellcheckInfo>> => {
      guardTrustedFrame(event, IPC_CHANNELS.SPELLCHECK_GET_INFO);
      const parsed = spellcheckGetInfoInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const { profileId, repos } = getFrameContext(event, ctx);
        const ses = ctx.profileManager.getSession(profileId);
        return { ok: true, data: getSpellcheckInfo(ses, repos.settings) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SPELLCHECK_GET_INFO);
      }
    },
  );
}

import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  integrationConnectTokenSchema,
  integrationOpenPrSchema,
  integrationProviderOnlySchema,
  integrationSetClientIdSchema,
  integrationSetEnabledSchema,
  integrationStartDeviceFlowSchema,
  type DeviceFlowPrompt,
  type IntegrationsStatus,
  type IpcResponse,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';
import { resolveWindowId } from './helpers';
import { InvariantViolationError } from '../lib/errors';
import { getIntegrationsService } from '../integrations/service';

/**
 * Perfil de la ventana que invoca. Todas las integraciones tienen ámbito de
 * perfil: el GitHub del trabajo y el personal no se mezclan.
 */
function profileForEvent(ctx: IpcContext, event: Electron.IpcMainInvokeEvent): string {
  const windowId = resolveWindowId(event);
  if (windowId === null) {
    throw new InvariantViolationError('integrations: webContents sin BrowserWindow asociada');
  }
  const profileId = ctx.profileWindowManager.getProfileForWindow(windowId);
  if (!profileId) {
    throw new InvariantViolationError(`integrations: window ${windowId} sin perfil asignado`);
  }
  return profileId;
}

export function registerIntegrationsHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.INTEGRATIONS_GET_STATUS,
    async (event, raw): Promise<IpcResponse<IntegrationsStatus>> => {
      guardTrustedFrame(event, IPC_CHANNELS.INTEGRATIONS_GET_STATUS);
      const parsed = integrationProviderOnlySchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
      try {
        const profileId = profileForEvent(ctx, event);
        return {
          ok: true,
          data: getIntegrationsService().getStatus(profileId, parsed.data.provider),
        };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.INTEGRATIONS_GET_STATUS);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.INTEGRATIONS_START_DEVICE_FLOW,
    async (event, raw): Promise<IpcResponse<DeviceFlowPrompt>> => {
      guardTrustedFrame(event, IPC_CHANNELS.INTEGRATIONS_START_DEVICE_FLOW);
      const parsed = integrationStartDeviceFlowSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
      try {
        const profileId = profileForEvent(ctx, event);
        const prompt = await getIntegrationsService().startDeviceFlow(
          profileId,
          parsed.data.provider,
        );
        return { ok: true, data: prompt };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.INTEGRATIONS_START_DEVICE_FLOW);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.INTEGRATIONS_CANCEL_DEVICE_FLOW,
    async (event, raw): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.INTEGRATIONS_CANCEL_DEVICE_FLOW);
      const parsed = integrationProviderOnlySchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
      try {
        getIntegrationsService().cancelDeviceFlow(
          profileForEvent(ctx, event),
          parsed.data.provider,
        );
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.INTEGRATIONS_CANCEL_DEVICE_FLOW);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.INTEGRATIONS_CONNECT_TOKEN,
    async (event, raw): Promise<IpcResponse<IntegrationsStatus>> => {
      guardTrustedFrame(event, IPC_CHANNELS.INTEGRATIONS_CONNECT_TOKEN);
      const parsed = integrationConnectTokenSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
      try {
        const status = await getIntegrationsService().connectWithToken(
          profileForEvent(ctx, event),
          parsed.data.provider,
          parsed.data.token,
        );
        return { ok: true, data: status };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.INTEGRATIONS_CONNECT_TOKEN);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.INTEGRATIONS_DISCONNECT,
    async (event, raw): Promise<IpcResponse<IntegrationsStatus>> => {
      guardTrustedFrame(event, IPC_CHANNELS.INTEGRATIONS_DISCONNECT);
      const parsed = integrationProviderOnlySchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
      try {
        const status = getIntegrationsService().disconnect(
          profileForEvent(ctx, event),
          parsed.data.provider,
        );
        return { ok: true, data: status };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.INTEGRATIONS_DISCONNECT);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.INTEGRATIONS_CHECK_NOW,
    async (event, raw): Promise<IpcResponse<IntegrationsStatus>> => {
      guardTrustedFrame(event, IPC_CHANNELS.INTEGRATIONS_CHECK_NOW);
      const parsed = integrationProviderOnlySchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
      try {
        const status = await getIntegrationsService().checkNow(
          profileForEvent(ctx, event),
          parsed.data.provider,
        );
        return { ok: true, data: status };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.INTEGRATIONS_CHECK_NOW);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.INTEGRATIONS_SET_ENABLED,
    async (event, raw): Promise<IpcResponse<IntegrationsStatus>> => {
      guardTrustedFrame(event, IPC_CHANNELS.INTEGRATIONS_SET_ENABLED);
      const parsed = integrationSetEnabledSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
      try {
        const status = getIntegrationsService().setEnabled(
          profileForEvent(ctx, event),
          parsed.data.provider,
          parsed.data.enabled,
        );
        return { ok: true, data: status };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.INTEGRATIONS_SET_ENABLED);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.INTEGRATIONS_SET_CLIENT_ID,
    async (event, raw): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.INTEGRATIONS_SET_CLIENT_ID);
      const parsed = integrationSetClientIdSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
      try {
        getIntegrationsService().setClientId(
          profileForEvent(ctx, event),
          parsed.data.provider,
          parsed.data.clientId,
        );
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.INTEGRATIONS_SET_CLIENT_ID);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.INTEGRATIONS_OPEN_PR,
    async (event, raw): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.INTEGRATIONS_OPEN_PR);
      const parsed = integrationOpenPrSchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
      // Solo se abren páginas web: el canal no puede servir para llevar la
      // shell a un esquema privilegiado.
      if (!/^https?:$/.test(new URL(parsed.data.url).protocol)) {
        return { ok: false, error: 'INVALID_INPUT' };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError('integrations:open-pr sin ventana');
        }
        const workspaceId = ctx.tabManager.getWorkspaceForWindow(windowId);
        if (!workspaceId) {
          throw new InvariantViolationError('integrations:open-pr sin workspace activo');
        }
        await ctx.tabManager.createTab(windowId, {
          workspaceId,
          parentId: null,
          url: parsed.data.url,
          activate: parsed.data.activate ?? false,
        });
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.INTEGRATIONS_OPEN_PR);
      }
    },
  );
}

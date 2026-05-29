import { app, ipcMain, shell } from 'electron';
import {
  IPC_CHANNELS,
  runtimeGetTabNavStateInputSchema,
  z,
  type AppVersions,
  type IpcResponse,
  type TabRuntime,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { resolveWindowId } from './helpers';
import { guardTrustedFrame } from './validate';
import { InvariantViolationError } from '../lib/errors';
import { backgroundMaterialSupported } from '../window/createMainWindow';

export function registerRuntimeHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.RUNTIME_GET_WINDOW_ID,
    async (event): Promise<IpcResponse<{ windowId: number }>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.RUNTIME_GET_WINDOW_ID);
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError(
            'runtime:get-window-id: webContents sin BrowserWindow asociada',
          );
        }
        return { ok: true, data: { windowId } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.RUNTIME_GET_WINDOW_ID);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RUNTIME_GET_CONTEXT,
    async (
      event,
    ): Promise<IpcResponse<{ windowId: number; profileId: string; activeTabId: string | null }>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.RUNTIME_GET_CONTEXT);
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError(
            'runtime:get-context: webContents sin BrowserWindow asociada',
          );
        }
        const profileId =
          ctx.profileWindowManager.getProfileForWindow(windowId);
        if (!profileId) {
          throw new InvariantViolationError(
            `runtime:get-context: window ${windowId} sin perfil asignado`,
          );
        }
        const activeTabId = ctx.tabManager.getActiveTabId(windowId);
        return { ok: true, data: { windowId, profileId, activeTabId } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.RUNTIME_GET_CONTEXT);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RUNTIME_GET_VERSIONS,
    async (): Promise<IpcResponse<AppVersions>> => {
      return {
        ok: true,
        data: {
          app: app.getVersion(),
          electron: process.versions['electron'] ?? '',
          chromium: process.versions['chrome'] ?? '',
          node: process.versions['node'] ?? '',
        },
      };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RUNTIME_GET_BACKGROUND_MATERIAL,
    async (): Promise<IpcResponse<{ supported: boolean }>> => {
      return { ok: true, data: { supported: backgroundMaterialSupported.value } };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DEFAULT_BROWSER_GET_STATUS,
    async (): Promise<IpcResponse<{ isDefault: boolean }>> => {
      const isDefault =
        app.isDefaultProtocolClient('https') && app.isDefaultProtocolClient('http');
      return { ok: true, data: { isDefault } };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DEFAULT_BROWSER_SET,
    async (event): Promise<IpcResponse<{ requested: boolean }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.DEFAULT_BROWSER_SET);
      const httpOk = app.setAsDefaultProtocolClient('http');
      const httpsOk = app.setAsDefaultProtocolClient('https');
      return { ok: true, data: { requested: httpOk && httpsOk } };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SHELL_OPEN_EXTERNAL,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.SHELL_OPEN_EXTERNAL);
      const parsed = z.object({ url: z.string().url().startsWith('https://') }).safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        await shell.openExternal(parsed.data.url);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SHELL_OPEN_EXTERNAL);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.RUNTIME_GET_TAB_NAV_STATE,
    async (event, payload): Promise<IpcResponse<TabRuntime | null>> => {
      guardTrustedFrame(event, IPC_CHANNELS.RUNTIME_GET_TAB_NAV_STATE);
      const parsed = runtimeGetTabNavStateInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        return { ok: true, data: ctx.tabManager.getRuntimeForTab(parsed.data.tabId) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.RUNTIME_GET_TAB_NAV_STATE);
      }
    },
  );
}

import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS, z, type IpcResponse } from '@vela/shared';
import type { WindowInfo } from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';
import { resolveWindowId } from './helpers';
import { InvariantViolationError } from '../lib/errors';
import { windowRegistry } from '../window/WindowRegistry';

export function registerMultiWindowHandlers(ctx: IpcContext): void {

  // Abrir una ventana blindada (efímera, sin perfil persistente)
  ipcMain.handle(
    IPC_CHANNELS.WINDOW_OPEN_BLINDED,
    async (event): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.WINDOW_OPEN_BLINDED);
      try {
        await ctx.profileWindowManager.openBlindedWindow();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WINDOW_OPEN_BLINDED);
      }
    },
  );

  // Abrir una nueva ventana del mismo perfil
  ipcMain.handle(
    IPC_CHANNELS.WINDOW_NEW_SAME_PROFILE,
    async (event): Promise<IpcResponse<{ windowId: string }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.WINDOW_NEW_SAME_PROFILE);
      try {
        const electronId = resolveWindowId(event);
        if (electronId === null) {
          throw new InvariantViolationError('window:new-same-profile: sin BrowserWindow');
        }
        const profileId = ctx.profileWindowManager.getProfileForWindow(electronId);
        if (!profileId) {
          throw new InvariantViolationError('window:new-same-profile: sin perfil asociado');
        }
        const newWin = await ctx.profileWindowManager.openWindow(profileId, {});
        const stableId = ctx.profileWindowManager.getStableWindowId(newWin.id);
        return { ok: true, data: { windowId: stableId ?? '' } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WINDOW_NEW_SAME_PROFILE);
      }
    },
  );

  // Asignar workspace a una ventana (desde WorkspaceSelector)
  ipcMain.handle(
    IPC_CHANNELS.WINDOW_SET_WORKSPACE,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.WINDOW_SET_WORKSPACE);
      const parsed = z.object({ workspaceId: z.string() }).safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const electronId = resolveWindowId(event);
        if (electronId === null) {
          throw new InvariantViolationError('window:set-workspace: sin BrowserWindow');
        }
        const stableId = ctx.profileWindowManager.getStableWindowId(electronId);
        const profileId = ctx.profileWindowManager.getProfileForWindow(electronId);
        if (!stableId || !profileId) {
          throw new InvariantViolationError('window:set-workspace: ventana no registrada');
        }

        const { workspaceId } = parsed.data;

        // Persistir en window_state y en el registry en memoria
        ctx.repositories.windowState.updateWorkspace(stableId, workspaceId);
        windowRegistry.updateWorkspace(stableId, workspaceId);

        // Notificar al renderer de esta ventana
        const win = BrowserWindow.fromId(electronId);
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC_EVENTS.WINDOW_WORKSPACE_CHANGED, { workspaceId });
        }

        // Cambiar el workspace activo en TabManager
        ctx.tabManager.setWorkspaceForWindow(electronId, workspaceId);

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WINDOW_SET_WORKSPACE);
      }
    },
  );

  // Obtener lista de ventanas del mismo perfil
  ipcMain.handle(
    IPC_CHANNELS.WINDOW_GET_ALL_FOR_PROFILE,
    async (event): Promise<IpcResponse<WindowInfo[]>> => {
      guardTrustedFrame(event, IPC_CHANNELS.WINDOW_GET_ALL_FOR_PROFILE);
      try {
        const electronId = resolveWindowId(event);
        if (electronId === null) {
          throw new InvariantViolationError('window:get-all-for-profile: sin BrowserWindow');
        }
        const profileId = ctx.profileWindowManager.getProfileForWindow(electronId);
        if (!profileId) {
          throw new InvariantViolationError('window:get-all-for-profile: sin perfil asociado');
        }
        const infos = ctx.profileWindowManager.getWindowInfos(profileId);
        return { ok: true, data: infos };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WINDOW_GET_ALL_FOR_PROFILE);
      }
    },
  );

  // Traer al frente una ventana por su stable windowId
  ipcMain.handle(
    IPC_CHANNELS.WINDOW_FOCUS,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.WINDOW_FOCUS);
      const parsed = z.object({ windowId: z.string() }).safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const entry = windowRegistry.get(parsed.data.windowId);
        if (entry && !entry.browserWindow.isDestroyed()) {
          entry.browserWindow.focus();
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WINDOW_FOCUS);
      }
    },
  );

  // Obtener el stable windowId de la ventana actual
  ipcMain.handle(
    IPC_CHANNELS.WINDOW_GET_CURRENT_ID,
    async (event): Promise<IpcResponse<{ windowId: string; isPrimary: boolean }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.WINDOW_GET_CURRENT_ID);
      try {
        const electronId = resolveWindowId(event);
        if (electronId === null) {
          throw new InvariantViolationError('window:get-current-id: sin BrowserWindow');
        }
        const stableId = ctx.profileWindowManager.getStableWindowId(electronId);
        if (!stableId) {
          throw new InvariantViolationError('window:get-current-id: sin stable windowId');
        }
        const entry = windowRegistry.get(stableId);
        return { ok: true, data: { windowId: stableId, isPrimary: entry?.isPrimary ?? true } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WINDOW_GET_CURRENT_ID);
      }
    },
  );
}

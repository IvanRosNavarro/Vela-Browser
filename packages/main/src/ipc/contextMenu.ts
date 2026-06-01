import path from 'node:path';
import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC_CHANNELS, z, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';

const execActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('image:copy'), wcvX: z.number(), wcvY: z.number() }),
  z.object({ type: z.literal('image:save'), url: z.string() }),
  z.object({ type: z.literal('page:save') }),
  z.object({ type: z.literal('page:print') }),
  z.object({ type: z.literal('devtools:inspect'), wcvX: z.number(), wcvY: z.number() }),
  z.object({ type: z.literal('link:open-window'), url: z.string() }),
  z.object({ type: z.literal('link:open-profile'), url: z.string(), profileId: z.string().min(1) }),
]);

function getWindowIdFromFrame(event: Electron.IpcMainInvokeEvent): number | null {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win?.id ?? null;
}

export function registerContextMenuHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.CONTEXT_MENU_EXEC,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.CONTEXT_MENU_EXEC);
      const parsedAction = execActionSchema.safeParse(payload);
      if (!parsedAction.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsedAction.error.flatten() };
      }
      try {
        const action = parsedAction.data;
        const windowId = getWindowIdFromFrame(event);
        if (windowId === null) return { ok: true, data: undefined };

        const wc = ctx.tabManager.getActiveTabWebContents(windowId);

        switch (action.type) {
          case 'image:copy':
            wc?.copyImageAt(action.wcvX, action.wcvY);
            break;

          case 'image:save': {
            wc?.downloadURL(action.url);
            break;
          }

          case 'page:save': {
            const { filePath, canceled } = await dialog.showSaveDialog({
              defaultPath: 'pagina.html',
              filters: [{ name: 'Página web', extensions: ['html', 'htm'] }],
            });
            if (!canceled && filePath) {
              wc?.savePage(filePath, 'HTMLComplete').catch(() => {});
            }
            break;
          }

          case 'page:print':
            wc?.print();
            break;

          case 'devtools:inspect':
            if (!wc) break;
            if (wc.isDevToolsOpened()) {
              wc.inspectElement(action.wcvX, action.wcvY);
            } else {
              wc.openDevTools({ mode: 'detach' });
              wc.inspectElement(action.wcvX, action.wcvY);
            }
            break;

          case 'link:open-window': {
            const profileId = ctx.tabManager.getProfileForWindow(windowId);
            if (!profileId) break;
            const url = action.url;
            ctx.profileWindowManager.openWindow(profileId).then((newWin) => {
              const newWsId = ctx.tabManager.getWorkspaceForWindow(newWin.id);
              if (!newWsId) return;
              ctx.tabManager.createTab(newWin.id, {
                workspaceId: newWsId,
                parentId: null,
                url,
                activate: true,
              }).catch(() => {});
            }).catch(() => {});
            break;
          }

          case 'link:open-profile': {
            const url = action.url;
            ctx.profileWindowManager.openWindow(action.profileId).then((newWin) => {
              const newWsId = ctx.tabManager.getWorkspaceForWindow(newWin.id);
              if (!newWsId) return;
              ctx.tabManager.createTab(newWin.id, {
                workspaceId: newWsId,
                parentId: null,
                url,
                activate: true,
              }).catch(() => {});
            }).catch(() => {});
            break;
          }
        }

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.CONTEXT_MENU_EXEC);
      }
    },
  );
}

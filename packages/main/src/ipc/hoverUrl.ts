import { ipcMain } from 'electron';
import { IPC_EVENTS, z } from '@vela/shared';
import type { IpcContext } from './context';

const setPayloadSchema = z.object({
  url: z.string(),
  isExternal: z.boolean(),
});

export function registerHoverUrlHandlers(ctx: IpcContext): void {
  ipcMain.on('hover-url:set', (event, payload: unknown) => {
    const parsed = setPayloadSchema.safeParse(payload);
    if (!parsed.success) return;

    const tabId = ctx.tabManager.getTabIdForWebContents(event.sender.id);
    if (!tabId) return;

    ctx.events.emit(IPC_EVENTS.HOVER_URL_CHANGED, {
      tabId,
      url: parsed.data.url,
      isExternal: parsed.data.isExternal,
    });
  });

  ipcMain.on('hover-url:clear', (event) => {
    const tabId = ctx.tabManager.getTabIdForWebContents(event.sender.id);
    if (!tabId) return;

    ctx.events.emit(IPC_EVENTS.HOVER_URL_CHANGED, {
      tabId,
      url: null,
      isExternal: false,
    });
  });
}

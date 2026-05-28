import {
  BrowserWindow,
  Menu,
  MenuItem,
  ipcMain,
  type IpcMainInvokeEvent,
} from 'electron';
import {
  IPC_CHANNELS,
  menuShowInputSchema,
  type IpcResponse,
  type MenuItemSpec,
  type MenuShowResult,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';

function buildMenu(
  items: MenuItemSpec[],
  onSelect: (id: string) => void,
): Menu {
  const menu = new Menu();
  for (const item of items) {
    if (item.type === 'separator') {
      menu.append(new MenuItem({ type: 'separator' }));
      continue;
    }
    if (item.type === 'submenu') {
      const sub = buildMenu(item.submenu, onSelect);
      menu.append(
        new MenuItem({
          label: item.label,
          enabled: item.enabled ?? true,
          submenu: sub,
        }),
      );
      continue;
    }
    const id = item.id;
    menu.append(
      new MenuItem({
        label: item.label,
        enabled: item.enabled ?? true,
        click: () => onSelect(id),
      }),
    );
  }
  return menu;
}

export function registerMenuHandlers(_ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.MENU_SHOW,
    async (
      event: IpcMainInvokeEvent,
      payload,
    ): Promise<IpcResponse<MenuShowResult>> => {
      guardTrustedFrame(event, IPC_CHANNELS.MENU_SHOW);
      const parsed = menuShowInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return { ok: true, data: { id: null } };

        return await new Promise<IpcResponse<MenuShowResult>>((resolve) => {
          let selectedId: string | null = null;
          const menu = buildMenu(parsed.data.items, (id) => {
            selectedId = id;
          });
          menu.popup({
            window: win,
            callback: () => {
              resolve({ ok: true, data: { id: selectedId } });
            },
          });
        });
      } catch (err) {
        return mapError(err, IPC_CHANNELS.MENU_SHOW);
      }
    },
  );
}

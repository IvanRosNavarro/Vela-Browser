import type { MenuItemSpec } from '@vela/shared';
import { call } from './ipc';

export type { MenuItemSpec } from '@vela/shared';

export type MenuActionMap = Record<string, () => void | Promise<void>>;

export async function showContextMenu(
  items: MenuItemSpec[],
  actions: MenuActionMap,
): Promise<void> {
  const result = await call(() => window.api.menu.show({ items }));
  if (!result.id) return;
  const handler = actions[result.id];
  if (handler) await handler();
}

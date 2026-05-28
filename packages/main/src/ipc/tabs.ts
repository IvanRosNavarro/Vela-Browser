import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  tabActivateInputSchema,
  tabSimpleInputSchema,
  z,
  type IpcResponse,
  type TabNode,
  type RecentlyClosedTab,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';
import { getReposForFrame, resolveWindowId } from './helpers';
import { InvariantViolationError } from '../lib/errors';

export function registerTabHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.TAB_ACTIVATE,
    async (event, payload): Promise<IpcResponse<{ id: string }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.TAB_ACTIVATE);
      const parsed = tabActivateInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const windowId =
          ctx.tabManager.getWindowIdForTab(parsed.data.id) ??
          resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError(
            'tab:activate: webContents sin BrowserWindow asociada',
          );
        }
        await ctx.tabManager.activateTab(windowId, parsed.data.id);
        return { ok: true, data: { id: parsed.data.id } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TAB_ACTIVATE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TAB_CLOSE,
    async (event, payload): Promise<IpcResponse<{ id: string }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.TAB_CLOSE);
      const parsed = tabSimpleInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const windowId =
          ctx.tabManager.getWindowIdForTab(parsed.data.id) ??
          resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError(
            'tab:close: no se pudo resolver windowId',
          );
        }
        await ctx.tabManager.closeTab(windowId, parsed.data.id);
        return { ok: true, data: { id: parsed.data.id } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TAB_CLOSE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TAB_DISCARD,
    async (event, payload): Promise<IpcResponse<TabNode>> => {
      const parsed = tabSimpleInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError(
            'tab:discard: webContents sin BrowserWindow asociada',
          );
        }
        await ctx.tabManager.discardTab(windowId, parsed.data.id);
        const repos = getReposForFrame(event, ctx);
        const node = repos.treeNodes.getById(parsed.data.id);
        if (!node || node.kind !== 'tab') {
          return {
            ok: false,
            error: 'NOT_FOUND',
            details: { entity: 'Tab', id: parsed.data.id },
          };
        }
        return { ok: true, data: node };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TAB_DISCARD);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TAB_RESTORE,
    async (event, payload): Promise<IpcResponse<TabNode>> => {
      const parsed = tabSimpleInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError(
            'tab:restore: webContents sin BrowserWindow asociada',
          );
        }
        await ctx.tabManager.restoreTab(windowId, parsed.data.id);
        const repos = getReposForFrame(event, ctx);
        const node = repos.treeNodes.getById(parsed.data.id);
        if (!node || node.kind !== 'tab') {
          return {
            ok: false,
            error: 'NOT_FOUND',
            details: { entity: 'Tab', id: parsed.data.id },
          };
        }
        return { ok: true, data: node };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TAB_RESTORE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TAB_PIN,
    async (event, payload): Promise<IpcResponse<TabNode>> => {
      guardTrustedFrame(event, IPC_CHANNELS.TAB_PIN);
      const parsed = tabSimpleInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError(
            'tab:pin: webContents sin BrowserWindow asociada',
          );
        }
        const updated = ctx.tabManager.pinTab(windowId, parsed.data.id);
        return { ok: true, data: updated };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TAB_PIN);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TAB_UNPIN,
    async (event, payload): Promise<IpcResponse<TabNode>> => {
      guardTrustedFrame(event, IPC_CHANNELS.TAB_UNPIN);
      const parsed = tabSimpleInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError(
            'tab:unpin: webContents sin BrowserWindow asociada',
          );
        }
        const updated = ctx.tabManager.unpinTab(windowId, parsed.data.id);
        return { ok: true, data: updated };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TAB_UNPIN);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TAB_RESTORE_PINNED_URL,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.TAB_RESTORE_PINNED_URL);
      const parsed = tabSimpleInputSchema.safeParse(payload);
      if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) throw new InvariantViolationError('tab:restore-pinned-url: no BrowserWindow');
        ctx.tabManager.restorePinnedUrl(windowId, parsed.data.id);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TAB_RESTORE_PINNED_URL);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TAB_REPLACE_PINNED_URL,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.TAB_REPLACE_PINNED_URL);
      const parsed = tabSimpleInputSchema.safeParse(payload);
      if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) throw new InvariantViolationError('tab:replace-pinned-url: no BrowserWindow');
        ctx.tabManager.replacePinnedUrl(windowId, parsed.data.id);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TAB_REPLACE_PINNED_URL);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TAB_ANCHOR,
    async (event, payload): Promise<IpcResponse<TabNode>> => {
      guardTrustedFrame(event, IPC_CHANNELS.TAB_ANCHOR);
      const parsed = tabSimpleInputSchema.safeParse(payload);
      if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      try {
        const updated = ctx.tabManager.anchorTab(parsed.data.id);
        return { ok: true, data: updated };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TAB_ANCHOR);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TAB_UNANCHOR,
    async (event, payload): Promise<IpcResponse<TabNode>> => {
      guardTrustedFrame(event, IPC_CHANNELS.TAB_UNANCHOR);
      const parsed = tabSimpleInputSchema.safeParse(payload);
      if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      try {
        const updated = ctx.tabManager.unanchorTab(parsed.data.id);
        return { ok: true, data: updated };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TAB_UNANCHOR);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TAB_RESTORE_ANCHORED_URL,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.TAB_RESTORE_ANCHORED_URL);
      const parsed = tabSimpleInputSchema.safeParse(payload);
      if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      try {
        ctx.tabManager.restoreAnchoredUrl(parsed.data.id);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TAB_RESTORE_ANCHORED_URL);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TAB_REPLACE_ANCHORED_URL,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.TAB_REPLACE_ANCHORED_URL);
      const parsed = tabSimpleInputSchema.safeParse(payload);
      if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      try {
        ctx.tabManager.replaceAnchoredUrl(parsed.data.id);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TAB_REPLACE_ANCHORED_URL);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TAB_LIST_ANCHORED,
    async (event): Promise<IpcResponse<TabNode[]>> => {
      guardTrustedFrame(event, IPC_CHANNELS.TAB_LIST_ANCHORED);
      try {
        const repos = getReposForFrame(event, ctx);
        return { ok: true, data: repos.treeNodes.listAnchored() };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TAB_LIST_ANCHORED);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.TABS_GET_RECENTLY_CLOSED,
    async (event): Promise<IpcResponse<RecentlyClosedTab[]>> => {
      guardTrustedFrame(event, IPC_CHANNELS.TABS_GET_RECENTLY_CLOSED);
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError(
            'tabs:recently-closed: webContents sin BrowserWindow asociada',
          );
        }
        const list = ctx.tabManager.getRecentlyClosed(windowId);
        return { ok: true, data: list };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TABS_GET_RECENTLY_CLOSED);
      }
    },
  );

  const reopenByIdSchema = z.object({ closedTabId: z.string() });

  ipcMain.handle(
    IPC_CHANNELS.TABS_REOPEN_BY_ID,
    async (event, payload): Promise<IpcResponse<{ id: string | null }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.TABS_REOPEN_BY_ID);
      const parsed = reopenByIdSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError(
            'tabs:reopen: webContents sin BrowserWindow asociada',
          );
        }
        const id = await ctx.tabManager.reopenById(windowId, parsed.data.closedTabId);
        return { ok: true, data: { id } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TABS_REOPEN_BY_ID);
      }
    },
  );

  const createSecureInputSchema = z.object({ url: z.string().optional() });

  ipcMain.handle(
    IPC_CHANNELS.TAB_CREATE_SECURE,
    async (event, payload): Promise<IpcResponse<{ id: string }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.TAB_CREATE_SECURE);
      const parsed = createSecureInputSchema.safeParse(payload ?? {});
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError('tab:create-secure: sin BrowserWindow asociada');
        }
        const id = await ctx.tabManager.createSecureTab(windowId, parsed.data.url);
        return { ok: true, data: { id } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.TAB_CREATE_SECURE);
      }
    },
  );
}

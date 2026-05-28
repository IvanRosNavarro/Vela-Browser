import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  discardTabIdInputSchema,
  discardFolderIdInputSchema,
  discardWorkspaceIdInputSchema,
  type IpcResponse,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getReposForFrame, resolveWindowId } from './helpers';
import { InvariantViolationError } from '../lib/errors';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers: whitelist getters / setters en settings_profile
// ──────────────────────────────────────────────────────────────────────────────

function getPermanentWhitelist(ctx: IpcContext, event: Electron.IpcMainInvokeEvent): string[] {
  const repos = getReposForFrame(event, ctx);
  const raw = repos.settings.get('tabs:discard-permanent-whitelist');
  return raw !== null ? (JSON.parse(raw) as string[]) : [];
}

function setPermanentWhitelist(ctx: IpcContext, event: Electron.IpcMainInvokeEvent, ids: string[]): void {
  const repos = getReposForFrame(event, ctx);
  repos.settings.set('tabs:discard-permanent-whitelist', JSON.stringify(ids));
}

function getWsWhitelists(ctx: IpcContext, event: Electron.IpcMainInvokeEvent): Record<string, boolean> {
  const repos = getReposForFrame(event, ctx);
  const raw = repos.settings.get('tabs:discard-workspace-whitelists');
  return raw !== null ? (JSON.parse(raw) as Record<string, boolean>) : {};
}

function setWsWhitelists(ctx: IpcContext, event: Electron.IpcMainInvokeEvent, map: Record<string, boolean>): void {
  const repos = getReposForFrame(event, ctx);
  repos.settings.set('tabs:discard-workspace-whitelists', JSON.stringify(map));
}

function getFolderWhitelists(ctx: IpcContext, event: Electron.IpcMainInvokeEvent): Record<string, boolean> {
  const repos = getReposForFrame(event, ctx);
  const raw = repos.settings.get('tabs:discard-folder-whitelists');
  return raw !== null ? (JSON.parse(raw) as Record<string, boolean>) : {};
}

function setFolderWhitelists(ctx: IpcContext, event: Electron.IpcMainInvokeEvent, map: Record<string, boolean>): void {
  const repos = getReposForFrame(event, ctx);
  repos.settings.set('tabs:discard-folder-whitelists', JSON.stringify(map));
}

// ──────────────────────────────────────────────────────────────────────────────
// Batch discard helper
// ──────────────────────────────────────────────────────────────────────────────

async function discardMany(
  ctx: IpcContext,
  windowId: number,
  tabIds: string[],
): Promise<void> {
  for (const tabId of tabIds) {
    const ownerWindow = ctx.tabManager.getWindowIdForTab(tabId) ?? windowId;
    try {
      await ctx.tabManager.discardTab(ownerWindow, tabId);
    } catch {
      // Tab activa o ya descartada — ignorar
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Handler registration
// ──────────────────────────────────────────────────────────────────────────────

export function registerDiscardHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.DISCARD_TAB,
    async (event, payload): Promise<IpcResponse<void>> => {
      const parsed = discardTabIdInputSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) throw new InvariantViolationError('discard:discard-tab: sin BrowserWindow');
        const ownerWindow = ctx.tabManager.getWindowIdForTab(parsed.data.tabId) ?? windowId;
        await ctx.tabManager.discardTab(ownerWindow, parsed.data.tabId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DISCARD_TAB);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DISCARD_FOLDER,
    async (event, payload): Promise<IpcResponse<void>> => {
      const parsed = discardFolderIdInputSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) throw new InvariantViolationError('discard:discard-folder: sin BrowserWindow');
        const repos = getReposForFrame(event, ctx);
        const folder = repos.treeNodes.getById(parsed.data.folderId);
        if (!folder) return { ok: true, data: undefined };
        const allNodes = repos.treeNodes.getByWorkspace(folder.workspaceId);
        const tabIds: string[] = [];
        const stack = [parsed.data.folderId];
        while (stack.length > 0) {
          const id = stack.pop()!;
          for (const n of allNodes) {
            if (n.parentId === id) {
              if (n.kind === 'tab') tabIds.push(n.id);
              else stack.push(n.id);
            }
          }
        }
        await discardMany(ctx, windowId, tabIds);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DISCARD_FOLDER);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.DISCARD_WORKSPACE,
    async (event, payload): Promise<IpcResponse<void>> => {
      const parsed = discardWorkspaceIdInputSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) throw new InvariantViolationError('discard:discard-workspace: sin BrowserWindow');
        const repos = getReposForFrame(event, ctx);
        const allNodes = repos.treeNodes.getByWorkspace(parsed.data.workspaceId);
        const tabIds = allNodes
          .filter((n) => n.kind === 'tab' && !n.discarded)
          .map((n) => n.id);
        await discardMany(ctx, windowId, tabIds);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DISCARD_WORKSPACE);
      }
    },
  );

  // discard:restore-tab
  ipcMain.handle(
    IPC_CHANNELS.DISCARD_RESTORE_TAB,
    async (event, payload): Promise<IpcResponse<void>> => {
      const parsed = discardTabIdInputSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) throw new InvariantViolationError('discard:restore-tab: sin BrowserWindow');
        await ctx.tabManager.restoreTab(windowId, parsed.data.tabId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DISCARD_RESTORE_TAB);
      }
    },
  );

  // discard:restore-workspace
  ipcMain.handle(
    IPC_CHANNELS.DISCARD_RESTORE_WORKSPACE,
    async (event, payload): Promise<IpcResponse<void>> => {
      const parsed = discardWorkspaceIdInputSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) throw new InvariantViolationError('discard:restore-workspace: sin BrowserWindow');
        const repos = getReposForFrame(event, ctx);
        const allNodes = repos.treeNodes.getByWorkspace(parsed.data.workspaceId);
        for (const node of allNodes) {
          if (node.kind !== 'tab' || !node.discarded) continue;
          try {
            await ctx.tabManager.restoreTab(windowId, node.id);
          } catch {
            // Tab en otro workspace — ignorar
          }
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DISCARD_RESTORE_WORKSPACE);
      }
    },
  );

  // discard:toggle-permanent-whitelist
  ipcMain.handle(
    IPC_CHANNELS.DISCARD_TOGGLE_PERMANENT_WHITELIST,
    (event, payload): IpcResponse<{ whitelisted: boolean }> => {
      const parsed = discardTabIdInputSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const list = getPermanentWhitelist(ctx, event);
        const idx = list.indexOf(parsed.data.tabId);
        const whitelisted = idx === -1;
        if (whitelisted) {
          list.push(parsed.data.tabId);
        } else {
          list.splice(idx, 1);
        }
        setPermanentWhitelist(ctx, event, list);
        return { ok: true, data: { whitelisted } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DISCARD_TOGGLE_PERMANENT_WHITELIST);
      }
    },
  );

  // discard:toggle-workspace-whitelist
  ipcMain.handle(
    IPC_CHANNELS.DISCARD_TOGGLE_WORKSPACE_WHITELIST,
    (event, payload): IpcResponse<{ whitelisted: boolean }> => {
      const parsed = discardWorkspaceIdInputSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const map = getWsWhitelists(ctx, event);
        const whitelisted = !map[parsed.data.workspaceId];
        if (whitelisted) {
          map[parsed.data.workspaceId] = true;
        } else {
          delete map[parsed.data.workspaceId];
        }
        setWsWhitelists(ctx, event, map);
        return { ok: true, data: { whitelisted } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DISCARD_TOGGLE_WORKSPACE_WHITELIST);
      }
    },
  );

  // discard:toggle-folder-whitelist
  ipcMain.handle(
    IPC_CHANNELS.DISCARD_TOGGLE_FOLDER_WHITELIST,
    (event, payload): IpcResponse<{ whitelisted: boolean }> => {
      const parsed = discardFolderIdInputSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const map = getFolderWhitelists(ctx, event);
        const whitelisted = !map[parsed.data.folderId];
        if (whitelisted) {
          map[parsed.data.folderId] = true;
        } else {
          delete map[parsed.data.folderId];
        }
        setFolderWhitelists(ctx, event, map);
        return { ok: true, data: { whitelisted } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DISCARD_TOGGLE_FOLDER_WHITELIST);
      }
    },
  );

  // discard:get-whitelist-status
  ipcMain.handle(
    IPC_CHANNELS.DISCARD_GET_WHITELIST_STATUS,
    (event, payload): IpcResponse<{ permanent: boolean; workspace: boolean; folder: boolean }> => {
      const parsed = discardTabIdInputSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const node = repos.treeNodes.getById(parsed.data.tabId);
        if (!node || node.kind !== 'tab') {
          return { ok: false, error: 'NOT_FOUND', details: { entity: 'Tab', id: parsed.data.tabId } };
        }
        const permList = getPermanentWhitelist(ctx, event);
        const wsMap = getWsWhitelists(ctx, event);
        const folderMap = getFolderWhitelists(ctx, event);
        return {
          ok: true,
          data: {
            permanent: permList.includes(node.id),
            workspace: !!wsMap[node.workspaceId],
            folder: node.parentId ? !!folderMap[node.parentId] : false,
          },
        };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.DISCARD_GET_WHITELIST_STATUS);
      }
    },
  );
}

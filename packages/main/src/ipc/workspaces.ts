import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  workspaceArchiveInputSchema,
  workspaceCreateInputSchema,
  workspaceDeleteInputSchema,
  workspaceReorderInputSchema,
  workspaceSetActiveInputSchema,
  workspaceUpdateInputSchema,
  type IpcResponse,
  type Workspace,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getFrameContext, getReposForFrame, resolveWindowId } from './helpers';
import { NotFoundError } from '../lib/errors';

const ACTIVE_WORKSPACE_KEY = 'active-workspace';

export function registerWorkspaceHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_LIST,
    async (event): Promise<IpcResponse<Workspace[]>> => {
      try {
        const repos = getReposForFrame(event, ctx);
        return { ok: true, data: repos.workspaces.list() };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WORKSPACE_LIST);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_LIST_ALL,
    async (event): Promise<IpcResponse<Workspace[]>> => {
      try {
        const repos = getReposForFrame(event, ctx);
        return { ok: true, data: repos.workspaces.listAll() };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WORKSPACE_LIST_ALL);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_GET_ACTIVE,
    async (event): Promise<IpcResponse<{ id: string | null }>> => {
      try {
        const repos = getReposForFrame(event, ctx);
        const stored = repos.metadata.get(ACTIVE_WORKSPACE_KEY);
        if (stored && repos.workspaces.getById(stored)) {
          return { ok: true, data: { id: stored } };
        }
        const fallback = repos.workspaces.list()[0]?.id ?? null;
        return { ok: true, data: { id: fallback } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WORKSPACE_GET_ACTIVE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_SET_ACTIVE,
    async (event, payload): Promise<IpcResponse<{ id: string }>> => {
      const parsed = workspaceSetActiveInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const { repos } = getFrameContext(event, ctx);
        const ws = repos.workspaces.getById(parsed.data.id);
        if (!ws) throw new NotFoundError('Workspace', parsed.data.id);
        repos.metadata.set(ACTIVE_WORKSPACE_KEY, ws.id);
        const windowId = parsed.data.sourceWindowId ?? resolveWindowId(event);
        if (windowId !== null) {
          try {
            ctx.tabManager.setWorkspaceForWindow(windowId, ws.id);
          } catch {
            // Si la window no estaba registrada todavía, seguimos: el
            // primer attachWindow restaurará el workspace correcto.
          }
          ctx.events.emit(IPC_EVENTS.ACTIVE_WORKSPACE_CHANGED, {
            windowId,
            workspaceId: ws.id,
          });
        }
        return { ok: true, data: { id: ws.id } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WORKSPACE_SET_ACTIVE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_CREATE,
    async (event, payload): Promise<IpcResponse<Workspace>> => {
      const parsed = workspaceCreateInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const ws = repos.workspaces.create(parsed.data);
        ctx.events.emit(IPC_EVENTS.WORKSPACES_CHANGED);
        return { ok: true, data: ws };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WORKSPACE_CREATE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_UPDATE,
    async (event, payload): Promise<IpcResponse<Workspace>> => {
      const parsed = workspaceUpdateInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const { id, ...patch } = parsed.data;
        const ws = repos.workspaces.update(id, patch);
        ctx.events.emit(IPC_EVENTS.WORKSPACES_CHANGED);
        return { ok: true, data: ws };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WORKSPACE_UPDATE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_DELETE,
    async (event, payload): Promise<IpcResponse<{ id: string }>> => {
      const parsed = workspaceDeleteInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        ctx.tabManager.cleanupWorkspaceTabs(parsed.data.id);
        repos.workspaces.delete(parsed.data.id);
        ctx.events.emit(IPC_EVENTS.WORKSPACES_CHANGED);
        return { ok: true, data: { id: parsed.data.id } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WORKSPACE_DELETE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_ARCHIVE,
    async (event, payload): Promise<IpcResponse<Workspace>> => {
      const parsed = workspaceArchiveInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const ws = repos.workspaces.archive(
          parsed.data.id,
          parsed.data.archived,
        );
        ctx.events.emit(IPC_EVENTS.WORKSPACES_CHANGED);
        return { ok: true, data: ws };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WORKSPACE_ARCHIVE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_REORDER,
    async (event, payload): Promise<IpcResponse<Workspace>> => {
      const parsed = workspaceReorderInputSchema.safeParse(payload);
      if (!parsed.success) {
        return {
          ok: false,
          error: 'INVALID_INPUT',
          details: parsed.error.flatten(),
        };
      }
      try {
        const repos = getReposForFrame(event, ctx);
        const ws = repos.workspaces.reorder(
          parsed.data.id,
          parsed.data.newPosition,
        );
        ctx.events.emit(IPC_EVENTS.WORKSPACES_CHANGED);
        return { ok: true, data: ws };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.WORKSPACE_REORDER);
      }
    },
  );
}

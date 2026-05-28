import fs from 'node:fs';
import { ipcMain, dialog, BrowserWindow } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS, z, type IpcResponse } from '@vela/shared';
import type { Favorite } from '@vela/shared';
import { generateKeyBetween } from 'fractional-indexing';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getFrameContext } from './helpers';

const listSchema = z.object({});
const addSchema = z.object({
  url: z.string().url(),
  title: z.string().max(512),
  favicon: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  windowId: z.number().optional(),
});
const removeSchema = z.object({ id: z.string().min(1) });
const reorderSchema = z.object({
  id: z.string().min(1),
  newPosition: z.string().min(1),
});
const updateTitleSchema = z.object({
  id: z.string().min(1),
  title: z.string().max(512),
});
const createFolderSchema = z.object({
  title: z.string().max(512),
  parentId: z.string().nullable().optional(),
});
const moveSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  newPosition: z.string().min(1),
});
const updateSchema = z.object({
  id: z.string().min(1),
  url: z.string().url().nullable().optional(),
  title: z.string().max(512).optional(),
  favicon: z.string().nullable().optional(),
});
const exportFileSchema = z.object({ data: z.string() });

function emitChanged(ctx: IpcContext, profileId: string, favorites: Favorite[]): void {
  ctx.events.emit(IPC_EVENTS.FAVORITES_CHANGED, { profileId, favorites });
}

export function registerFavoritesHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.FAVORITES_LIST,
    async (event): Promise<IpcResponse<Favorite[]>> => {
      try {
        listSchema.parse({});
        const { repos } = getFrameContext(event, ctx);
        return { ok: true, data: repos.favorites.list() };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FAVORITES_LIST);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.FAVORITES_ADD,
    async (event, payload): Promise<IpcResponse<Favorite>> => {
      try {
        const { url, title, favicon, parentId, windowId } = addSchema.parse(payload);
        const { repos, profileId } = getFrameContext(event, ctx);
        const existing = repos.favorites.getByUrl(url);
        if (existing) return { ok: true, data: existing };

        // Obtener el título live del WCV activo. El renderer puede mandar un título
        // desactualizado (stale del treeStore) o el título del propio popup
        // (document.title del BrowserWindow popup). Usamos windowId si viene en el
        // payload (popup → ventana padre), sino el window del sender (AddressBar directo).
        let resolvedTitle = title;
        const targetWindowId = windowId ?? BrowserWindow.fromWebContents(event.sender)?.id;
        if (targetWindowId !== undefined) {
          const wc = ctx.tabManager.getActiveTabWebContents(targetWindowId);
          if (wc && !wc.isDestroyed()) {
            const liveTitle = wc.getTitle();
            if (liveTitle) resolvedTitle = liveTitle;
          }
        }

        const lastPos = repos.favorites.lastPositionInParent(parentId ?? null);
        const position = generateKeyBetween(lastPos, null);
        const id = crypto.randomUUID();
        const favorite = repos.favorites.add({ id, url, title: resolvedTitle, favicon, position, parentId: parentId ?? null });
        emitChanged(ctx, profileId, repos.favorites.list());
        return { ok: true, data: favorite };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FAVORITES_ADD);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.FAVORITES_REMOVE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { id } = removeSchema.parse(payload);
        const { repos, profileId } = getFrameContext(event, ctx);
        repos.favorites.remove(id);
        emitChanged(ctx, profileId, repos.favorites.list());
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FAVORITES_REMOVE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.FAVORITES_REORDER,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { id, newPosition } = reorderSchema.parse(payload);
        const { repos, profileId } = getFrameContext(event, ctx);
        repos.favorites.reorder(id, newPosition);
        emitChanged(ctx, profileId, repos.favorites.list());
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FAVORITES_REORDER);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.FAVORITES_UPDATE_TITLE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { id, title } = updateTitleSchema.parse(payload);
        const { repos, profileId } = getFrameContext(event, ctx);
        repos.favorites.updateTitle(id, title);
        emitChanged(ctx, profileId, repos.favorites.list());
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FAVORITES_UPDATE_TITLE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.FAVORITES_CREATE_FOLDER,
    async (event, payload): Promise<IpcResponse<Favorite>> => {
      try {
        const { title, parentId } = createFolderSchema.parse(payload);
        const { repos, profileId } = getFrameContext(event, ctx);
        const lastPos = repos.favorites.lastPositionInParent(parentId ?? null);
        const position = generateKeyBetween(lastPos, null);
        const id = crypto.randomUUID();
        const folder = repos.favorites.createFolder({ id, title, position, parentId: parentId ?? null });
        emitChanged(ctx, profileId, repos.favorites.list());
        return { ok: true, data: folder };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FAVORITES_CREATE_FOLDER);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.FAVORITES_MOVE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { id, parentId, newPosition } = moveSchema.parse(payload);
        const { repos, profileId } = getFrameContext(event, ctx);
        repos.favorites.move(id, parentId, newPosition);
        emitChanged(ctx, profileId, repos.favorites.list());
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FAVORITES_MOVE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.FAVORITES_UPDATE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { id, url, title, favicon } = updateSchema.parse(payload);
        const { repos, profileId } = getFrameContext(event, ctx);
        repos.favorites.update(id, { url: url ?? undefined, title, favicon: favicon ?? undefined });
        emitChanged(ctx, profileId, repos.favorites.list());
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FAVORITES_UPDATE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.FAVORITES_EXPORT_FILE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { data } = exportFileSchema.parse(payload);
        const win = BrowserWindow.fromWebContents(event.sender)
          ?? BrowserWindow.getFocusedWindow();
        const opts = {
          title: 'Exportar Favoritos',
          defaultPath: 'vela-favorites.json',
          filters: [{ name: 'JSON', extensions: ['json'] }],
        };
        const result = win
          ? await dialog.showSaveDialog(win, opts)
          : await dialog.showSaveDialog(opts);
        if (result.canceled || !result.filePath) return { ok: true, data: undefined };
        fs.writeFileSync(result.filePath, data, 'utf8');
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FAVORITES_EXPORT_FILE);
      }
    },
  );
}

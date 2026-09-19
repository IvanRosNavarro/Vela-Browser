import fs from 'node:fs';
import { ipcMain, dialog, BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  favoritesAddInputSchema,
  favoritesCreateFolderInputSchema,
  favoritesExportFileInputSchema,
  favoritesMoveInputSchema,
  favoritesRemoveInputSchema,
  favoritesReorderInputSchema,
  favoritesUpdateInputSchema,
  type IpcResponse,
} from '@vela/shared';
import type { Favorite } from '@vela/shared';
import type { z } from '@vela/shared';
import { generateKeyBetween } from 'fractional-indexing';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getFrameContext } from './helpers';
import { guardTrustedFrame } from './validate';
import { DuplicateFavoriteUrlError } from '../storage/repositories/FavoritesRepository';
import type { SyncEntityEvent } from '../sync/syncEvents';

function emitChanged(ctx: IpcContext, profileId: string, favorites: Favorite[]): void {
  ctx.events.emit(IPC_EVENTS.FAVORITES_CHANGED, { profileId, favorites });
}

/** Sube de una vez los cambios acumulados por `FavoritesRepository.runBatch`. */
export function pushFavoriteChanges(ctx: IpcContext, profileId: string, changes: SyncEntityEvent[]): void {
  if (changes.length === 0) return;
  const sync = ctx.syncManagers.get(profileId);
  if (sync) void sync.pushChanges(changes);
}

type Parsed<S extends z.ZodTypeAny> =
  | { ok: true; data: z.output<S> }
  | { ok: false; response: IpcResponse<never> };

function parse<S extends z.ZodTypeAny>(
  event: IpcMainInvokeEvent,
  channel: string,
  schema: S,
  payload: unknown,
): Parsed<S> {
  guardTrustedFrame(event, channel);
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      response: { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() },
    };
  }
  return { ok: true, data: parsed.data as z.output<S> };
}

export function registerFavoritesHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.FAVORITES_LIST,
    async (event): Promise<IpcResponse<Favorite[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.FAVORITES_LIST);
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
        const input = parse(event, IPC_CHANNELS.FAVORITES_ADD, favoritesAddInputSchema, payload);
        if (!input.ok) return input.response;
        const { url, title, favicon, parentId, windowId } = input.data;
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
        const input = parse(event, IPC_CHANNELS.FAVORITES_REMOVE, favoritesRemoveInputSchema, payload);
        if (!input.ok) return input.response;
        const { id, cascade } = input.data;
        const { repos, profileId } = getFrameContext(event, ctx);
        const { changes } = repos.favorites.runBatch(() => repos.favorites.remove(id, { cascade }));
        pushFavoriteChanges(ctx, profileId, changes);
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
        const input = parse(event, IPC_CHANNELS.FAVORITES_REORDER, favoritesReorderInputSchema, payload);
        if (!input.ok) return input.response;
        const { repos, profileId } = getFrameContext(event, ctx);
        repos.favorites.reorder(input.data.id, input.data.newPosition);
        emitChanged(ctx, profileId, repos.favorites.list());
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FAVORITES_REORDER);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.FAVORITES_CREATE_FOLDER,
    async (event, payload): Promise<IpcResponse<Favorite>> => {
      try {
        const input = parse(event, IPC_CHANNELS.FAVORITES_CREATE_FOLDER, favoritesCreateFolderInputSchema, payload);
        if (!input.ok) return input.response;
        const { title, parentId } = input.data;
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
        const input = parse(event, IPC_CHANNELS.FAVORITES_MOVE, favoritesMoveInputSchema, payload);
        if (!input.ok) return input.response;
        const { id, parentId, newPosition } = input.data;
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
        const input = parse(event, IPC_CHANNELS.FAVORITES_UPDATE, favoritesUpdateInputSchema, payload);
        if (!input.ok) return input.response;
        const { id, url, title, favicon } = input.data;
        const { repos, profileId } = getFrameContext(event, ctx);
        repos.favorites.update(id, { url, title, favicon });
        emitChanged(ctx, profileId, repos.favorites.list());
        return { ok: true, data: undefined };
      } catch (err) {
        if (err instanceof DuplicateFavoriteUrlError) {
          return { ok: false, error: 'INVALID_INPUT', details: { reason: 'DUPLICATE_URL', url: err.url } };
        }
        return mapError(err, IPC_CHANNELS.FAVORITES_UPDATE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.FAVORITES_EXPORT_FILE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const input = parse(event, IPC_CHANNELS.FAVORITES_EXPORT_FILE, favoritesExportFileInputSchema, payload);
        if (!input.ok) return input.response;
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
        fs.writeFileSync(result.filePath, input.data.data, 'utf8');
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FAVORITES_EXPORT_FILE);
      }
    },
  );
}

import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  IPC_EVENTS,
  browserImportRunInputSchema,
  type BrowserImportResult,
  type ImportableBrowser,
  type IpcResponse,
} from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getFrameContext } from './helpers';
import { guardTrustedFrame } from './validate';
import { pushFavoriteChanges } from './favorites';
import { detectBrowsers, toImportableBrowsers } from '../browserImport/detect';
import { runBrowserImport } from '../browserImport/runImport';
import { SourceDatabaseLockedError } from '../browserImport/sqliteCopy';
import { logger } from '../logger';

/**
 * Importación de marcadores e historial desde otros navegadores.
 *
 * El renderer nunca manda rutas: elige un navegador y un perfil de la lista
 * que devuelve `detect`, y `run` los vuelve a buscar en una detección nueva.
 * Un id que no salga de esa detección se rechaza.
 */
export function registerBrowserImportHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.BROWSER_IMPORT_DETECT,
    async (event): Promise<IpcResponse<ImportableBrowser[]>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.BROWSER_IMPORT_DETECT);
        return { ok: true, data: toImportableBrowsers(detectBrowsers()) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.BROWSER_IMPORT_DETECT);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.BROWSER_IMPORT_RUN,
    async (event, payload): Promise<IpcResponse<BrowserImportResult>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.BROWSER_IMPORT_RUN);
        const parsed = browserImportRunInputSchema.safeParse(payload);
        if (!parsed.success) {
          return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
        }
        const input = parsed.data;
        const { repos, profileId, windowId } = getFrameContext(event, ctx);

        const browser = detectBrowsers().find((b) => b.id === input.browserId);
        const profile = browser?.profiles.find((p) => p.id === input.profileId);
        if (!browser || !profile) {
          return { ok: false, error: 'NOT_FOUND', details: { entity: 'BrowserProfile', id: input.profileId } };
        }

        const workspaceId =
          ctx.tabManager.getWorkspaceForWindow(windowId) ??
          repos.metadata.get('active-workspace') ??
          repos.workspaces.listAll()[0]?.id ??
          null;
        if (input.history && !workspaceId) {
          return { ok: false, error: 'INVARIANT', details: 'No hay ningún workspace al que asociar el historial' };
        }

        let outcome: ReturnType<typeof runBrowserImport>;
        try {
          outcome = runBrowserImport({
            browser,
            profile,
            bookmarks: input.bookmarks,
            history: input.history,
            repos,
            workspaceId: workspaceId ?? '',
          });
        } catch (err) {
          if (err instanceof SourceDatabaseLockedError) {
            logger.warn(`[browser-import] ${browser.id}: ${err.message}`);
            return { ok: false, error: 'INVARIANT', details: { reason: 'SOURCE_LOCKED', browser: browser.name } };
          }
          throw err;
        }

        const { result, favoriteChanges } = outcome;
        logger.info(
          `[browser-import] ${browser.id}: ${result.bookmarksAdded} favoritos (${result.bookmarksSkipped} ya estaban), ` +
            `${result.historyAdded} visitas (${result.historySkipped} omitidas)`,
        );

        if (input.bookmarks) {
          pushFavoriteChanges(ctx, profileId, favoriteChanges);
          ctx.events.emit(IPC_EVENTS.FAVORITES_CHANGED, { profileId, favorites: repos.favorites.list() });
        }

        return { ok: true, data: result };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.BROWSER_IMPORT_RUN);
      }
    },
  );
}

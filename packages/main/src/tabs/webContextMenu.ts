import { type WebContents, BrowserWindow } from 'electron';
import {
  buildSearchUrl,
  searchEngineLabel,
  SEARCH_ENGINE_DEFAULT,
  SEARCH_ENGINE_IDS,
  type SearchEngineId,
  type SearchSettings,
  type ContextMenuShowPayload,
} from '@vela/shared';
import type { IpcContext } from '../ipc/context';
import { ContextMenuPopup } from './ContextMenuPopup';

// Singleton: un único popup para toda la vida de la app.
let popup: ContextMenuPopup | null = null;

function getPopup(ctx: IpcContext): ContextMenuPopup {
  if (!popup) popup = new ContextMenuPopup(ctx);
  return popup;
}

function getSearchSettings(ctx: IpcContext, profileId: string): SearchSettings {
  try {
    const repos = ctx.profileManager.getRepositories(profileId);
    const engineRaw = repos.settings.get('search:engine');
    const customUrlRaw = repos.settings.get('search:custom-url');
    const engine: SearchSettings['engine'] = SEARCH_ENGINE_IDS.includes(engineRaw as SearchEngineId)
      ? (engineRaw as SearchSettings['engine'])
      : SEARCH_ENGINE_DEFAULT;
    return { engine, customUrl: customUrlRaw ?? null };
  } catch {
    return { engine: SEARCH_ENGINE_DEFAULT, customUrl: null };
  }
}

export function attachWebContextMenu(
  webContents: WebContents,
  win: BrowserWindow,
  ctx: IpcContext,
): void {
  webContents.on('context-menu', (_event, params) => {
    if (win.isDestroyed()) return;
    const windowId = win.id;

    const profileId = ctx.tabManager.getProfileForWindow(windowId);
    const workspaceId = ctx.tabManager.getWorkspaceForWindow(windowId);
    const activeTabId = ctx.tabManager.getActiveTabId(windowId);

    const canGoBack = webContents.navigationHistory.canGoBack();
    const canGoForward = webContents.navigationHistory.canGoForward();

    const settings = profileId
      ? getSearchSettings(ctx, profileId)
      : { engine: SEARCH_ENGINE_DEFAULT as SearchSettings['engine'], customUrl: null };

    let link: ContextMenuShowPayload['link'] = null;
    if (params.linkURL) {
      const profiles = ctx.repositories.profiles
        .list()
        .filter((p) => !p.archived)
        .map((p) => ({ id: p.id, name: p.name }));
      // Solo los workspaces distintos del que ya muestra la ventana: abrir en
      // el propio workspace es justo lo que hacen los items de "nueva pestaña".
      let workspaces: Array<{ id: string; name: string }> = [];
      if (profileId) {
        try {
          workspaces = ctx.profileManager
            .getRepositories(profileId)
            .workspaces.list()
            .filter((w) => w.id !== workspaceId)
            .map((w) => ({ id: w.id, name: w.name }));
        } catch {
          workspaces = [];
        }
      }
      link = { url: params.linkURL, text: params.linkText || undefined, profiles, workspaces };
    }

    let image: ContextMenuShowPayload['image'] = null;
    if (params.mediaType === 'image' && params.srcURL) {
      image = { url: params.srcURL };
    }

    let selection: ContextMenuShowPayload['selection'] = null;
    if (params.selectionText) {
      selection = {
        text: params.selectionText,
        searchLabel: searchEngineLabel(settings),
        searchUrl: buildSearchUrl(settings, params.selectionText),
      };
    }

    const payload: ContextMenuShowPayload = {
      windowId,
      x: params.x,
      y: params.y,
      wcvX: params.x,
      wcvY: params.y,
      canGoBack,
      canGoForward,
      activeTabId,
      link,
      image,
      selection,
      isEditable: params.isEditable,
      editFlags: {
        canCut: params.editFlags.canCut,
        canCopy: params.editFlags.canCopy,
        canPaste: params.editFlags.canPaste,
        canSelectAll: params.editFlags.canSelectAll,
      },
      currentUrl: webContents.getURL() || null,
      currentTitle: webContents.getTitle() || null,
    };

    getPopup(ctx).show(payload, win, webContents, workspaceId);
  });
}

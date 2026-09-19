import fs from 'node:fs';
import type { BrowserImportResult } from '@vela/shared';
import type { ProfileRepositories } from '../profiles/ProfileManager';
import type { SyncEntityEvent } from '../sync/syncEvents';
import type { DetectedBrowser, DetectedProfile } from './detect';
import { parseChromiumBookmarks, readChromiumHistory } from './chromium';
import { readFirefoxBookmarks, readFirefoxHistory } from './firefox';
import { withSqliteCopy } from './sqliteCopy';
import {
  historyRetentionCutoff,
  importBookmarksIntoFavorites,
  importVisitsIntoHistory,
} from './apply';
import type { ImportedFolder, ImportedVisit } from './types';

/** Tope de visitas por importación, de la más reciente hacia atrás. */
export const MAX_IMPORTED_VISITS = 100_000;

function readSetting<T>(repos: ProfileRepositories, key: string, fallback: T): T {
  try {
    const raw = repos.settings.get(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export interface RunImportParams {
  browser: DetectedBrowser;
  profile: DetectedProfile;
  bookmarks: boolean;
  history: boolean;
  repos: ProfileRepositories;
  /** Workspace al que se asocian las visitas importadas. */
  workspaceId: string;
}

/**
 * Importa marcadores y/o historial de un perfil detectado. Devuelve además los
 * cambios de Favoritos para que el llamante los suba a sync de una vez.
 */
export function runBrowserImport(params: RunImportParams): {
  result: BrowserImportResult;
  favoriteChanges: SyncEntityEvent[];
} {
  const { browser, profile, repos } = params;
  const result: BrowserImportResult = {
    bookmarksAdded: 0,
    bookmarksSkipped: 0,
    historyAdded: 0,
    historySkipped: 0,
    historyDisabled: false,
  };
  let favoriteChanges: SyncEntityEvent[] = [];

  if (params.bookmarks && profile.bookmarksFile) {
    const file = profile.bookmarksFile;
    const roots: ImportedFolder[] =
      browser.engine === 'chromium'
        ? parseChromiumBookmarks(JSON.parse(fs.readFileSync(file, 'utf8')) as unknown)
        : withSqliteCopy(file, readFirefoxBookmarks);
    const batch = repos.favorites.runBatch(() =>
      importBookmarksIntoFavorites(repos.favorites, `Importado de ${browser.name}`, roots),
    );
    result.bookmarksAdded = batch.result.added;
    result.bookmarksSkipped = batch.result.skipped;
    favoriteChanges = batch.changes;
  }

  if (params.history && profile.historyFile) {
    if (readSetting<boolean>(repos, 'history:enabled', true) === false) {
      result.historyDisabled = true;
    } else {
      const now = Date.now();
      const cutoff = historyRetentionCutoff(readSetting<string | null>(repos, 'history:retention', null), now);
      const opts = { since: cutoff, limit: MAX_IMPORTED_VISITS };
      const visits: ImportedVisit[] = withSqliteCopy(profile.historyFile, (db) =>
        browser.engine === 'chromium' ? readChromiumHistory(db, opts) : readFirefoxHistory(db, opts),
      );
      const imported = importVisitsIntoHistory(repos.history, visits, {
        workspaceId: params.workspaceId,
        sessionId: `import-${browser.id}-${now}`,
        cutoff,
      });
      result.historyAdded = imported.added;
      result.historySkipped = imported.skipped;
    }
  }

  return { result, favoriteChanges };
}

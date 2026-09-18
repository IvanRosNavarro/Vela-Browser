import { createHash, randomUUID } from 'node:crypto';
import { generateKeyBetween } from 'fractional-indexing';
import type { FavoritesRepository } from '../storage/repositories/FavoritesRepository';
import type { HistoryRepository } from '../storage/repositories/HistoryRepository';
import type { ImportedFolder, ImportedNode, ImportedVisit } from './types';

interface LazyFolder {
  title: string;
  parent: LazyFolder | null;
  id: string | null;
}

/**
 * Vuelca un árbol de marcadores en Favoritos, bajo una carpeta raíz
 * (`Importado de Chrome`) con las raíces del navegador como subcarpetas.
 *
 * Importar dos veces no duplica nada: la URL de un favorito es única, así que
 * los marcadores que ya están (en cualquier carpeta) se saltan, y las carpetas
 * se reutilizan por título dentro de su padre. Una carpeta solo se crea cuando
 * va a recibir al menos un marcador nuevo, para no dejar carpetas vacías.
 *
 * Debe llamarse dentro de `repo.runBatch` para que todo vaya en una
 * transacción y los cambios de sync se suban en bloque.
 */
export function importBookmarksIntoFavorites(
  repo: FavoritesRepository,
  rootTitle: string,
  roots: ImportedFolder[],
  newId: () => string = randomUUID,
): { added: number; skipped: number } {
  let added = 0;
  let skipped = 0;
  const knownUrls = new Set<string>();
  for (const fav of repo.list()) if (fav.url) knownUrls.add(fav.url);

  const ensure = (folder: LazyFolder): string => {
    if (folder.id) return folder.id;
    const parentId = folder.parent ? ensure(folder.parent) : null;
    const existing = repo.findFolder(parentId, folder.title);
    if (existing) {
      folder.id = existing.id;
    } else {
      const id = newId();
      repo.createFolder({
        id,
        title: folder.title,
        position: generateKeyBetween(repo.lastPositionInParent(parentId), null),
        parentId,
      });
      folder.id = id;
    }
    return folder.id;
  };

  const walk = (nodes: ImportedNode[], into: LazyFolder): void => {
    for (const node of nodes) {
      if (node.kind === 'folder') {
        walk(node.children, { title: node.title, parent: into, id: null });
        continue;
      }
      if (knownUrls.has(node.url)) {
        skipped++;
        continue;
      }
      const parentId = ensure(into);
      repo.add({
        id: newId(),
        url: node.url,
        title: node.title,
        favicon: null,
        position: generateKeyBetween(repo.lastPositionInParent(parentId), null),
        parentId,
      });
      knownUrls.add(node.url);
      added++;
    }
  };

  const root: LazyFolder = { title: rootTitle, parent: null, id: null };
  for (const top of roots) {
    walk(top.children, { title: top.title, parent: root, id: null });
  }
  return { added, skipped };
}

const RETENTION_MS: Record<string, number> = {
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  '3months': 90 * 24 * 60 * 60 * 1000,
  '6months': 180 * 24 * 60 * 60 * 1000,
};

/**
 * Fecha mínima que se conserva según el ajuste `history:retention` (los mismos
 * periodos que expira el job diario de `index.ts`). 0 = sin límite.
 */
export function historyRetentionCutoff(retention: string | null, now: number): number {
  const ms = retention ? RETENTION_MS[retention] : undefined;
  return ms ? now - ms : 0;
}

/**
 * Id estable de una visita importada: reimportar el mismo navegador produce
 * los mismos ids y el `INSERT OR IGNORE` no duplica nada.
 */
export function importedVisitId(url: string, visitedAt: number): string {
  return `imp-${createHash('sha1').update(`${url}\n${visitedAt}`).digest('hex')}`;
}

export function importVisitsIntoHistory(
  history: HistoryRepository,
  visits: ImportedVisit[],
  opts: { workspaceId: string; sessionId: string; cutoff: number },
): { added: number; skipped: number } {
  const entries = visits
    .filter((v) => v.visitedAt >= opts.cutoff && v.visitedAt <= Date.now() + 60_000)
    .map((v) => ({
      id: importedVisitId(v.url, v.visitedAt),
      url: v.url,
      title: v.title,
      favicon: null,
      visitedAt: v.visitedAt,
      workspaceId: opts.workspaceId,
      sessionId: opts.sessionId,
    }));
  const added = history.insertManyIfAbsent(entries);
  return { added, skipped: visits.length - added };
}

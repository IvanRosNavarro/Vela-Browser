import type { DatabaseSync } from 'node:sqlite';
import { generateKeyBetween } from 'fractional-indexing';
import { transaction } from 'vela-kit/storage';
import type { Favorite } from '@vela/shared';
import { CycleError, InvariantViolationError, NotFoundError } from '../../lib/errors';
import { syncEvents, type SyncEntityEvent } from '../../sync/syncEvents';
import { serializers } from '../../sync/serializers';

interface FavoriteRow {
  id: string;
  url: string | null;
  title: string;
  favicon: string | null;
  position: string;
  created_at: number;
  updated_at: number | null;
  type: string;
  parent_id: string | null;
}

export type StoredFavorite = Favorite & { updatedAt: number };

function rowToFavorite(row: FavoriteRow): StoredFavorite {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    favicon: row.favicon,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    type: (row.type === 'folder' ? 'folder' : 'bookmark') as 'bookmark' | 'folder',
    parentId: row.parent_id,
  };
}

/** La URL ya pertenece a otro favorito (índice único `idx_favorites_url_unique`). */
export class DuplicateFavoriteUrlError extends Error {
  constructor(readonly url: string) {
    super(`Ya hay un favorito con la URL ${url}`);
    this.name = 'DuplicateFavoriteUrlError';
  }
}

export class FavoritesRepository {
  private readonly selectCols: string;
  private readonly hasUpdatedAt: boolean;
  /**
   * Mientras corre `runBatch`, los cambios para sync se acumulan aquí en vez
   * de emitirse uno a uno: una importación de miles de marcadores no debe
   * disparar miles de peticiones al servidor.
   */
  private collected: SyncEntityEvent[] | null = null;
  private inTransaction = false;

  constructor(
    private readonly db: DatabaseSync,
    private readonly profileId?: string,
  ) {
    const row = db
      .prepare("SELECT COUNT(*) as c FROM pragma_table_info('profile_favorites') WHERE name = 'updated_at'")
      .get() as { c: number };
    this.hasUpdatedAt = row.c > 0;
    this.selectCols = this.hasUpdatedAt
      ? 'id, url, title, favicon, position, created_at, updated_at, type, parent_id'
      : 'id, url, title, favicon, position, created_at, created_at as updated_at, type, parent_id';
  }

  list(): StoredFavorite[] {
    return (this.db
      .prepare(`SELECT ${this.selectCols} FROM profile_favorites ORDER BY position ASC`)
      .all() as FavoriteRow[]).map(rowToFavorite);
  }

  getByUrl(url: string): StoredFavorite | null {
    const row = this.db
      .prepare(`SELECT ${this.selectCols} FROM profile_favorites WHERE url = ? AND type = 'bookmark'`)
      .get(url) as FavoriteRow | undefined;
    return row ? rowToFavorite(row) : null;
  }

  getById(id: string): StoredFavorite | null {
    const row = this.db
      .prepare(`SELECT ${this.selectCols} FROM profile_favorites WHERE id = ?`)
      .get(id) as FavoriteRow | undefined;
    return row ? rowToFavorite(row) : null;
  }

  /** Carpeta hija directa de `parentId` con ese título exacto, si la hay. */
  findFolder(parentId: string | null, title: string): StoredFavorite | null {
    const row = (parentId
      ? this.db
          .prepare(`SELECT ${this.selectCols} FROM profile_favorites WHERE type = 'folder' AND parent_id = ? AND title = ? ORDER BY position LIMIT 1`)
          .get(parentId, title)
      : this.db
          .prepare(`SELECT ${this.selectCols} FROM profile_favorites WHERE type = 'folder' AND parent_id IS NULL AND title = ? ORDER BY position LIMIT 1`)
          .get(title)) as FavoriteRow | undefined;
    return row ? rowToFavorite(row) : null;
  }

  childrenOf(parentId: string | null): StoredFavorite[] {
    const rows = parentId
      ? this.db.prepare(`SELECT ${this.selectCols} FROM profile_favorites WHERE parent_id = ? ORDER BY position ASC`).all(parentId)
      : this.db.prepare(`SELECT ${this.selectCols} FROM profile_favorites WHERE parent_id IS NULL ORDER BY position ASC`).all();
    return (rows as FavoriteRow[]).map(rowToFavorite);
  }

  /** Ids de todo lo que cuelga de `id`, a cualquier profundidad (sin incluirlo). */
  descendantIds(id: string): string[] {
    const rows = this.db
      .prepare(
        `WITH RECURSIVE sub(id) AS (
           SELECT id FROM profile_favorites WHERE parent_id = ?
           UNION
           SELECT f.id FROM profile_favorites f JOIN sub ON f.parent_id = sub.id
         )
         SELECT id FROM sub`,
      )
      .all(id) as { id: string }[];
    return rows.map((r) => r.id);
  }

  lastPositionInParent(parentId: string | null): string | null {
    const row = parentId
      ? this.db.prepare('SELECT position FROM profile_favorites WHERE parent_id = ? ORDER BY position DESC LIMIT 1').get(parentId) as { position: string } | undefined
      : this.db.prepare('SELECT position FROM profile_favorites WHERE parent_id IS NULL ORDER BY position DESC LIMIT 1').get() as { position: string } | undefined;
    return row?.position ?? null;
  }

  add(data: { id: string; url: string; title: string; favicon?: string | null; position: string; parentId?: string | null }): StoredFavorite {
    const now = Date.now();
    if (this.hasUpdatedAt) {
      this.db
        .prepare(
          `INSERT INTO profile_favorites (id, url, title, favicon, position, created_at, updated_at, type, parent_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'bookmark', ?)
           ON CONFLICT(url) DO NOTHING`,
        )
        .run(data.id, data.url, data.title, data.favicon ?? null, data.position, now, now, data.parentId ?? null);
    } else {
      this.db
        .prepare(
          `INSERT INTO profile_favorites (id, url, title, favicon, position, created_at, type, parent_id)
           VALUES (?, ?, ?, ?, ?, ?, 'bookmark', ?)
           ON CONFLICT(url) DO NOTHING`,
        )
        .run(data.id, data.url, data.title, data.favicon ?? null, data.position, now, data.parentId ?? null);
    }
    const fav = this.db
      .prepare(`SELECT ${this.selectCols} FROM profile_favorites WHERE url = ?`)
      .get(data.url) as FavoriteRow;
    const result = rowToFavorite(fav);
    if (result.id === data.id) this.emitSyncChange(result);
    return result;
  }

  createFolder(data: { id: string; title: string; position: string; parentId?: string | null }): StoredFavorite {
    const now = Date.now();
    if (data.parentId) this.assertFolder(data.parentId);
    if (this.hasUpdatedAt) {
      this.db
        .prepare(
          `INSERT INTO profile_favorites (id, url, title, favicon, position, created_at, updated_at, type, parent_id)
           VALUES (?, NULL, ?, NULL, ?, ?, ?, 'folder', ?)`,
        )
        .run(data.id, data.title, data.position, now, now, data.parentId ?? null);
    } else {
      this.db
        .prepare(
          `INSERT INTO profile_favorites (id, url, title, favicon, position, created_at, type, parent_id)
           VALUES (?, NULL, ?, NULL, ?, ?, 'folder', ?)`,
        )
        .run(data.id, data.title, data.position, now, data.parentId ?? null);
    }
    const fav = this.db
      .prepare(`SELECT ${this.selectCols} FROM profile_favorites WHERE id = ?`)
      .get(data.id) as FavoriteRow;
    const result = rowToFavorite(fav);
    this.emitSyncChange(result);
    return result;
  }

  /**
   * Elimina un favorito. Si es una carpeta, `cascade` decide qué pasa con su
   * contenido: `true` lo borra entero; `false` lo sube al nivel de la carpeta,
   * detrás de lo que ya hubiera allí y en el mismo orden.
   */
  remove(id: string, opts: { cascade?: boolean } = {}): void {
    const item = this.getById(id);
    if (!item) return;
    this.tx(() => {
      if (item.type === 'folder') {
        if (opts.cascade) {
          for (const childId of this.descendantIds(id)) {
            this.db.prepare('DELETE FROM profile_favorites WHERE id = ?').run(childId);
            this.emitSyncDelete(childId);
          }
        } else {
          let last = this.lastPositionInParent(item.parentId);
          for (const child of this.childrenOf(id)) {
            last = generateKeyBetween(last, null);
            this.writeParentAndPosition(child.id, item.parentId, last);
          }
        }
      }
      this.db.prepare('DELETE FROM profile_favorites WHERE id = ?').run(id);
      this.emitSyncDelete(id);
    });
  }

  reorder(id: string, newPosition: string): void {
    const now = Date.now();
    if (this.hasUpdatedAt) {
      this.db.prepare('UPDATE profile_favorites SET position = ?, updated_at = ? WHERE id = ?').run(newPosition, now, id);
    } else {
      this.db.prepare('UPDATE profile_favorites SET position = ? WHERE id = ?').run(newPosition, id);
    }
    const fav = this.getById(id);
    if (fav) this.emitSyncChange(fav);
  }

  /**
   * Mueve un favorito o una carpeta a otra carpeta (o a la raíz con null).
   * Rechaza destinos que no sean carpetas y los ciclos: una carpeta no puede
   * acabar dentro de sí misma ni de una de sus subcarpetas.
   */
  move(id: string, parentId: string | null, newPosition: string): void {
    const item = this.getById(id);
    if (!item) throw new NotFoundError('Favorite', id);
    if (parentId !== null) {
      if (parentId === id) throw new CycleError('Una carpeta no puede contenerse a sí misma');
      this.assertFolder(parentId);
      if (item.type === 'folder' && this.descendantIds(id).includes(parentId)) {
        throw new CycleError('No se puede mover una carpeta dentro de una de sus subcarpetas');
      }
    }
    this.writeParentAndPosition(id, parentId, newPosition);
  }

  update(id: string, data: { url?: string; title?: string; favicon?: string | null }): void {
    const current = this.getById(id);
    if (!current) throw new NotFoundError('Favorite', id);
    if (data.url !== undefined) {
      if (current.type === 'folder') {
        throw new InvariantViolationError('Las carpetas de favoritos no tienen dirección');
      }
      const clash = this.getByUrl(data.url);
      if (clash && clash.id !== id) throw new DuplicateFavoriteUrlError(data.url);
    }
    const next = {
      url: data.url !== undefined ? data.url : current.url,
      title: data.title !== undefined ? data.title : current.title,
      favicon: data.favicon !== undefined ? data.favicon : current.favicon,
    };
    if (this.hasUpdatedAt) {
      this.db
        .prepare('UPDATE profile_favorites SET url = ?, title = ?, favicon = ?, updated_at = ? WHERE id = ?')
        .run(next.url, next.title, next.favicon, Date.now(), id);
    } else {
      this.db
        .prepare('UPDATE profile_favorites SET url = ?, title = ?, favicon = ? WHERE id = ?')
        .run(next.url, next.title, next.favicon, id);
    }
    const fav = this.getById(id);
    if (fav) this.emitSyncChange(fav);
  }

  /**
   * Ejecuta `fn` en una transacción y devuelve, en vez de emitirlos, los
   * cambios de sync que haya producido. Quien llama decide cómo subirlos
   * (`SyncManager.pushChanges`, que los agrupa en lotes).
   */
  runBatch<T>(fn: () => T): { result: T; changes: SyncEntityEvent[] } {
    if (this.collected) return { result: fn(), changes: [] };
    const changes: SyncEntityEvent[] = [];
    this.collected = changes;
    try {
      const result = this.tx(fn);
      return { result, changes };
    } finally {
      this.collected = null;
    }
  }

  /** Transacción que tolera anidarse (remove dentro de runBatch). */
  private tx<T>(fn: () => T): T {
    if (this.inTransaction) return fn();
    this.inTransaction = true;
    try {
      return transaction(this.db, fn);
    } finally {
      this.inTransaction = false;
    }
  }

  /** Upsert desde sync remoto — no emite syncEvents salvo al resolver un duplicado. */
  syncUpsert(data: {
    id: string;
    url: string | null;
    title: string;
    favicon?: string | null;
    position: string;
    updatedAt: number;
    type?: string;
    parentId?: string | null;
  }): void {
    // La URL es única. Si dos dispositivos guardaron la misma dirección con
    // ids distintos (p. ej. importaron el mismo navegador), ganan siempre los
    // mismos: el id menor. Así todos convergen al mismo favorito en vez de
    // chocar con el índice único o intercambiarse los ids.
    if (data.url && (data.type ?? 'bookmark') === 'bookmark') {
      const clash = this.getByUrl(data.url);
      if (clash && clash.id !== data.id) {
        if (data.id > clash.id) return;
        this.db.prepare('DELETE FROM profile_favorites WHERE id = ?').run(clash.id);
        this.emitSyncDelete(clash.id);
      }
    }
    if (this.hasUpdatedAt) {
      this.db
        .prepare(
          `INSERT INTO profile_favorites (id, url, title, favicon, position, created_at, updated_at, type, parent_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             url        = excluded.url,
             title      = excluded.title,
             favicon    = excluded.favicon,
             position   = excluded.position,
             updated_at = excluded.updated_at,
             type       = excluded.type,
             parent_id  = excluded.parent_id
           WHERE excluded.updated_at > profile_favorites.updated_at`,
        )
        .run(data.id, data.url ?? null, data.title, data.favicon ?? null, data.position, data.updatedAt, data.updatedAt, data.type ?? 'bookmark', data.parentId ?? null);
    } else {
      this.db
        .prepare(
          `INSERT INTO profile_favorites (id, url, title, favicon, position, created_at, type, parent_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             url       = excluded.url,
             title     = excluded.title,
             favicon   = excluded.favicon,
             position  = excluded.position,
             type      = excluded.type,
             parent_id = excluded.parent_id`,
        )
        .run(data.id, data.url ?? null, data.title, data.favicon ?? null, data.position, data.updatedAt, data.type ?? 'bookmark', data.parentId ?? null);
    }
  }

  /**
   * Borrado llegado por sync: solo la fila. Si era una carpeta, el otro
   * dispositivo envía aparte lo que pasó con su contenido (borrado o movido).
   */
  syncDelete(id: string): void {
    this.db.prepare('DELETE FROM profile_favorites WHERE id = ?').run(id);
  }

  private assertFolder(id: string): void {
    const parent = this.getById(id);
    if (!parent) throw new NotFoundError('Favorite', id);
    if (parent.type !== 'folder') {
      throw new InvariantViolationError('El destino no es una carpeta de favoritos');
    }
  }

  private writeParentAndPosition(id: string, parentId: string | null, position: string): void {
    if (this.hasUpdatedAt) {
      this.db
        .prepare('UPDATE profile_favorites SET parent_id = ?, position = ?, updated_at = ? WHERE id = ?')
        .run(parentId, position, Date.now(), id);
    } else {
      this.db.prepare('UPDATE profile_favorites SET parent_id = ?, position = ? WHERE id = ?').run(parentId, position, id);
    }
    const fav = this.getById(id);
    if (fav) this.emitSyncChange(fav);
  }

  private emit(evt: SyncEntityEvent): void {
    if (this.collected) this.collected.push(evt);
    else syncEvents.emit('entity:changed', evt);
  }

  private emitSyncChange(fav: StoredFavorite): void {
    if (!this.profileId) return;
    this.emit({
      profileId: this.profileId,
      type: 'favorite',
      id: fav.id,
      data: serializers['favorite']!.toSync(fav),
      updatedAt: fav.updatedAt,
    });
  }

  private emitSyncDelete(id: string): void {
    if (!this.profileId) return;
    this.emit({
      profileId: this.profileId,
      type: 'favorite',
      id,
      data: null,
      updatedAt: Date.now(),
    });
  }
}

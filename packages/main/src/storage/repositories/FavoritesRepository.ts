import type { DatabaseSync } from 'node:sqlite';
import type { Favorite } from '@vela/shared';
import { syncEvents } from '../../sync/syncEvents';
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

function rowToFavorite(row: FavoriteRow): Favorite & { updatedAt: number } {
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

export class FavoritesRepository {
  private readonly selectCols: string;
  private readonly hasUpdatedAt: boolean;

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

  list(): (Favorite & { updatedAt: number })[] {
    return (this.db
      .prepare(`SELECT ${this.selectCols} FROM profile_favorites ORDER BY position ASC`)
      .all() as FavoriteRow[]).map(rowToFavorite);
  }

  getByUrl(url: string): (Favorite & { updatedAt: number }) | null {
    const row = this.db
      .prepare(`SELECT ${this.selectCols} FROM profile_favorites WHERE url = ? AND type = 'bookmark'`)
      .get(url) as FavoriteRow | undefined;
    return row ? rowToFavorite(row) : null;
  }

  getById(id: string): (Favorite & { updatedAt: number }) | null {
    const row = this.db
      .prepare(`SELECT ${this.selectCols} FROM profile_favorites WHERE id = ?`)
      .get(id) as FavoriteRow | undefined;
    return row ? rowToFavorite(row) : null;
  }

  lastPositionInParent(parentId: string | null): string | null {
    const row = parentId
      ? this.db.prepare('SELECT position FROM profile_favorites WHERE parent_id = ? ORDER BY position DESC LIMIT 1').get(parentId) as { position: string } | undefined
      : this.db.prepare('SELECT position FROM profile_favorites WHERE parent_id IS NULL ORDER BY position DESC LIMIT 1').get() as { position: string } | undefined;
    return row?.position ?? null;
  }

  /** @deprecated use lastPositionInParent(null) */
  lastPosition(): string | null {
    return this.lastPositionInParent(null);
  }

  add(data: { id: string; url: string; title: string; favicon?: string | null; position: string; parentId?: string | null }): Favorite & { updatedAt: number } {
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
    this.emitSyncChange(result);
    return result;
  }

  createFolder(data: { id: string; title: string; position: string; parentId?: string | null }): Favorite & { updatedAt: number } {
    const now = Date.now();
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

  remove(id: string): void {
    const item = this.getById(id);
    if (item?.type === 'folder') {
      this.db.prepare('UPDATE profile_favorites SET parent_id = ? WHERE parent_id = ?').run(item.parentId, id);
    }
    this.db.prepare('DELETE FROM profile_favorites WHERE id = ?').run(id);
    this.emitSyncDelete(id);
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

  move(id: string, parentId: string | null, newPosition: string): void {
    const now = Date.now();
    if (this.hasUpdatedAt) {
      this.db.prepare('UPDATE profile_favorites SET parent_id = ?, position = ?, updated_at = ? WHERE id = ?').run(parentId, newPosition, now, id);
    } else {
      this.db.prepare('UPDATE profile_favorites SET parent_id = ?, position = ? WHERE id = ?').run(parentId, newPosition, id);
    }
    const fav = this.getById(id);
    if (fav) this.emitSyncChange(fav);
  }

  updateTitle(id: string, title: string): void {
    const now = Date.now();
    if (this.hasUpdatedAt) {
      this.db.prepare('UPDATE profile_favorites SET title = ?, updated_at = ? WHERE id = ?').run(title, now, id);
    } else {
      this.db.prepare('UPDATE profile_favorites SET title = ? WHERE id = ?').run(title, id);
    }
    const fav = this.getById(id);
    if (fav) this.emitSyncChange(fav);
  }

  update(id: string, data: { url?: string | null; title?: string; favicon?: string | null }): void {
    const now = Date.now();
    if (data.url !== undefined) {
      if (this.hasUpdatedAt) {
        this.db.prepare('UPDATE profile_favorites SET url = ?, updated_at = ? WHERE id = ?').run(data.url, now, id);
      } else {
        this.db.prepare('UPDATE profile_favorites SET url = ? WHERE id = ?').run(data.url, id);
      }
    }
    if (data.title !== undefined) {
      if (this.hasUpdatedAt) {
        this.db.prepare('UPDATE profile_favorites SET title = ?, updated_at = ? WHERE id = ?').run(data.title, now, id);
      } else {
        this.db.prepare('UPDATE profile_favorites SET title = ? WHERE id = ?').run(data.title, id);
      }
    }
    if (data.favicon !== undefined) {
      if (this.hasUpdatedAt) {
        this.db.prepare('UPDATE profile_favorites SET favicon = ?, updated_at = ? WHERE id = ?').run(data.favicon, now, id);
      } else {
        this.db.prepare('UPDATE profile_favorites SET favicon = ? WHERE id = ?').run(data.favicon, id);
      }
    }
    const fav = this.getById(id);
    if (fav) this.emitSyncChange(fav);
  }

  /** Upsert desde sync remoto — no emite syncEvents. */
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

  private emitSyncChange(fav: Favorite & { updatedAt: number }): void {
    if (!this.profileId) return;
    syncEvents.emit('entity:changed', {
      profileId: this.profileId,
      type: 'favorite',
      id: fav.id,
      data: serializers['favorite']!.toSync(fav),
      updatedAt: fav.updatedAt,
    });
  }

  private emitSyncDelete(id: string): void {
    if (!this.profileId) return;
    syncEvents.emit('entity:changed', {
      profileId: this.profileId,
      type: 'favorite',
      id,
      data: null,
      updatedAt: Date.now(),
    });
  }
}

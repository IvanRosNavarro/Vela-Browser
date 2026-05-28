import type { DatabaseSync } from 'node:sqlite';
import type { StoredNotification } from '@vela/shared';

interface NotificationRow {
  id: string;
  origin: string;
  title: string;
  body: string;
  icon: string | null;
  timestamp: number;
  read: number;
  tab_id: string | null;
  source: string;
}

export class NotificationRepository {
  constructor(private readonly db: DatabaseSync) {}

  insert(n: StoredNotification): void {
    this.db
      .prepare(
        `INSERT INTO notifications
           (id, origin, title, body, icon, timestamp, read, tab_id, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      )
      .run(
        n.id,
        n.origin,
        n.title,
        n.body,
        n.icon ?? null,
        n.timestamp,
        n.tabId ?? null,
        n.source,
        Date.now(),
      );
  }

  findAll(): Omit<StoredNotification, 'profileId'>[] {
    const rows = this.db
      .prepare(
        `SELECT id, origin, title, body, icon, timestamp, read, tab_id, source
         FROM notifications ORDER BY timestamp DESC`,
      )
      .all() as NotificationRow[];
    return rows.map(this.mapRow);
  }

  countUnread(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as c FROM notifications WHERE read = 0')
      .get() as { c: number } | undefined;
    return row?.c ?? 0;
  }

  markRead(id: string): void {
    this.db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
  }

  markAllRead(): void {
    this.db.prepare('UPDATE notifications SET read = 1').run();
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM notifications WHERE id = ?').run(id);
  }

  clear(): void {
    this.db.prepare('DELETE FROM notifications').run();
  }

  private mapRow(r: NotificationRow): Omit<StoredNotification, 'profileId'> {
    return {
      id: r.id,
      origin: r.origin,
      title: r.title,
      body: r.body,
      icon: r.icon,
      timestamp: r.timestamp,
      read: r.read === 1,
      tabId: r.tab_id,
      source: (r.source === 'push' ? 'push' : 'web') as 'web' | 'push',
    };
  }
}

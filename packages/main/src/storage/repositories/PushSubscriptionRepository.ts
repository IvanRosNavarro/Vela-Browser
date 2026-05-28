import type { DatabaseSync } from 'node:sqlite';

interface PushSubscriptionRow {
  id: string;
  origin: string;
  endpoint: string;
  p256dh_key: Buffer;
  auth_secret: Buffer;
  created_at: number;
  last_push_at: number | null;
}

export interface PushSubscription {
  id: string;
  origin: string;
  endpoint: string;
  p256dhKey: Buffer;
  authSecret: Buffer;
  createdAt: number;
  lastPushAt: number | null;
}

export class PushSubscriptionRepository {
  constructor(private readonly db: DatabaseSync) {}

  upsert(sub: PushSubscription): void {
    this.db
      .prepare(
        `INSERT INTO push_subscriptions
           (id, origin, endpoint, p256dh_key, auth_secret, created_at, last_push_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(origin) DO UPDATE SET
           id = excluded.id,
           endpoint = excluded.endpoint,
           p256dh_key = excluded.p256dh_key,
           auth_secret = excluded.auth_secret,
           created_at = excluded.created_at,
           last_push_at = excluded.last_push_at`,
      )
      .run(
        sub.id,
        sub.origin,
        sub.endpoint,
        sub.p256dhKey,
        sub.authSecret,
        sub.createdAt,
        sub.lastPushAt ?? null,
      );
  }

  delete(origin: string): void {
    this.db.prepare('DELETE FROM push_subscriptions WHERE origin = ?').run(origin);
  }

  deleteAll(): void {
    this.db.prepare('DELETE FROM push_subscriptions').run();
  }

  findAll(): PushSubscription[] {
    const rows = this.db
      .prepare('SELECT * FROM push_subscriptions ORDER BY created_at DESC')
      .all() as PushSubscriptionRow[];
    return rows.map(this.mapRow);
  }

  findByOrigin(origin: string): PushSubscription | null {
    const row = this.db
      .prepare('SELECT * FROM push_subscriptions WHERE origin = ?')
      .get(origin) as PushSubscriptionRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  updateLastPushAt(origin: string, timestamp: number): void {
    this.db
      .prepare('UPDATE push_subscriptions SET last_push_at = ? WHERE origin = ?')
      .run(timestamp, origin);
  }

  private mapRow(r: PushSubscriptionRow): PushSubscription {
    return {
      id: r.id,
      origin: r.origin,
      endpoint: r.endpoint,
      p256dhKey: r.p256dh_key,
      authSecret: r.auth_secret,
      createdAt: r.created_at,
      lastPushAt: r.last_push_at,
    };
  }
}

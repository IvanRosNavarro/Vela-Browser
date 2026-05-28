import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { migration001 } from './migrations/001_initial';
import { migration002 } from './migrations/002_push_proxy';

let db: Database.Database;

export function initDatabase(dbPath: string): void {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(migration001);
  db.exec(migration002);

  console.log(`Database initialized at ${dbPath}`);
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

export function nextSeq(profileId: string): number {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO profile_sequences (profile_id, last_seq)
    VALUES (?, 1)
    ON CONFLICT(profile_id) DO UPDATE
    SET last_seq = last_seq + 1
    RETURNING last_seq
  `);
  const result = stmt.get(profileId) as { last_seq: number };
  return result.last_seq;
}

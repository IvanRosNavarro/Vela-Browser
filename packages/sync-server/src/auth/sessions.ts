import { getDb } from '../db/database';
import { nanoid } from 'nanoid';

export interface DeviceSession {
  token: string;
  userId: string;
  deviceName: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createSession(
  userId: string,
  deviceName = 'Dispositivo'
): string {
  const token = nanoid(48);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  getDb().prepare(`
    INSERT INTO device_sessions
      (token, user_id, device_name,
       created_at, last_used_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(token, userId, deviceName, now, now, expiresAt);

  return token;
}

export function validateSession(
  token: string
): DeviceSession | null {
  const row = getDb().prepare(`
    SELECT token, user_id, device_name,
           created_at, last_used_at, expires_at
    FROM device_sessions
    WHERE token = ? AND expires_at > ?
  `).get(token, Date.now()) as any;

  if (!row) return null;

  return {
    token: row.token,
    userId: row.user_id,
    deviceName: row.device_name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
  };
}

export function revokeSession(token: string): void {
  getDb().prepare(
    'DELETE FROM device_sessions WHERE token = ?'
  ).run(token);
}

import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/database';

declare global {
  namespace Express {
    interface Request {
      userId: string;
      ws?: import('ws').WebSocket;
    }
  }
}

export function requireAuth(
  req: Request, res: Response, next: NextFunction
): void {
  const token = req.headers.authorization
    ?.replace('Bearer ', '').trim();

  if (!token) {
    res.status(401).json({ error: 'No autorizado' });
    return;
  }

  const db = getDb();
  const session = db.prepare(`
    SELECT user_id FROM device_sessions
    WHERE token = ? AND expires_at > ?
  `).get(token, Date.now()) as { user_id: string } | undefined;

  if (!session) {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
    return;
  }

  db.prepare(`
    UPDATE device_sessions
    SET last_used_at = ? WHERE token = ?
  `).run(Date.now(), token);

  req.userId = session.user_id;
  next();
}

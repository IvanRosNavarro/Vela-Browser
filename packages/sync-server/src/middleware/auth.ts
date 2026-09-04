import { Request, Response, NextFunction } from 'express';
import { getDb } from '../db/database';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

declare global {
  namespace Express {
    interface Request {
      userId: string;
      /**
       * Token de sesión del dispositivo que hace la petición. Se usa para no
       * notificarle por WebSocket un cambio que acaba de escribir él mismo:
       * sin esto cada push se provocaba su propio pull y el ciclo se realimenta.
       */
      deviceToken: string;
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
    SET last_used_at = ?, expires_at = ?
    WHERE token = ?
  `).run(Date.now(), Date.now() + SESSION_TTL_MS, token);

  req.userId = session.user_id;
  req.deviceToken = token;
  next();
}

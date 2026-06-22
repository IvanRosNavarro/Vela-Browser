import { Router, raw as expressRaw } from 'express';
import { nanoid } from 'nanoid';
import { getDb } from '../db/database';
import { requireAuth } from '../middleware/auth';
import { broadcastPush } from '../sync/websocket';
import { rateLimitPushRelay } from '../middleware/rate-limit';

export const pushRouter = Router();

// POST /push/register — authenticated; registers a proxy token for a (profile, origin)
pushRouter.post('/register', requireAuth, (req, res) => {
  const { profile_id, origin } = req.body as {
    profile_id?: string;
    origin?: string;
  };

  if (!profile_id || !origin) {
    res.status(400).json({ error: 'profile_id and origin are required' });
    return;
  }
  if (profile_id.length > 128 || origin.length > 2048) {
    res.status(400).json({ error: 'invalid profile_id or origin' });
    return;
  }

  const db = getDb();

  // El token de routing lo GENERA el servidor, nunca el cliente. Así es siempre
  // impredecible y de longitud fija; un cliente no puede fijar un token corto,
  // adivinable o que colisione con el de otro usuario.
  const token = nanoid(32);

  try {
    db.prepare(`
      INSERT INTO push_proxy_tokens (token, user_id, profile_id, origin, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, profile_id, origin) DO UPDATE
        SET token = excluded.token, created_at = excluded.created_at
    `).run(token, req.userId, profile_id, origin, Date.now());

    // Devolvemos el token para que el cliente construya su endpoint de push.
    res.status(200).json({ ok: true, token });
  } catch (err) {
    console.error('[push] register error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /push/:token — public (called by push services); relay encrypted payload to WS.
// Rate-limit por token: el token viaja por la infraestructura de push (semi-público),
// así que sin límite sería un vector de flood/amplificación contra la víctima.
pushRouter.post('/:token', rateLimitPushRelay, expressRaw({ type: '*/*', limit: '64kb' }), (req, res) => {
  const { token } = req.params;

  const db = getDb();
  const row = db.prepare(`
    SELECT user_id, profile_id, origin FROM push_proxy_tokens WHERE token = ?
  `).get(token) as { user_id: string; profile_id: string; origin: string } | undefined;

  if (!row) {
    // Return 200 to avoid push service retries for unknown tokens
    res.status(200).json({ ok: true });
    return;
  }

  let payloadB64: string;
  const body = req.body as Buffer | undefined;

  if (body && body.length > 0) {
    payloadB64 = body.toString('base64');
  } else {
    // No body — empty notification (just a ping)
    payloadB64 = '';
  }

  broadcastPush(row.user_id, row.profile_id, row.origin, payloadB64);

  res.status(200).json({ ok: true });
});

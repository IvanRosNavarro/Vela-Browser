import { Router, raw as expressRaw } from 'express';
import { getDb } from '../db/database';
import { requireAuth } from '../middleware/auth';
import { broadcastPush } from '../sync/websocket';

export const pushRouter = Router();

// POST /push/register — authenticated; registers a proxy token for a (profile, origin)
pushRouter.post('/register', requireAuth, (req, res) => {
  const { token, profile_id, origin } = req.body as {
    token?: string;
    profile_id?: string;
    origin?: string;
  };

  if (!token || !profile_id || !origin) {
    res.status(400).json({ error: 'token, profile_id and origin are required' });
    return;
  }

  const db = getDb();

  try {
    db.prepare(`
      INSERT INTO push_proxy_tokens (token, user_id, profile_id, origin, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, profile_id, origin) DO UPDATE
        SET token = excluded.token, created_at = excluded.created_at
    `).run(token, req.userId, profile_id, origin, Date.now());

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[push] register error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// POST /push/:token — public (called by push services); relay encrypted payload to WS
pushRouter.post('/:token', expressRaw({ type: '*/*', limit: '64kb' }), (req, res) => {
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

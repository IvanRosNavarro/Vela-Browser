import { Router } from 'express';
import { nanoid } from 'nanoid';
import { getDb } from '../db/database';
import { sendMagicLink } from '../email/resend';
import { createSession } from './sessions';
import {
  rateLimitMagicLink,
  rateLimitMagicLinkByEmail,
  rateLimitVerify,
} from '../middleware/rate-limit';

export const authRouter = Router();

/** Aplicaciones que pueden pedir un enlace mágico, con su esquema de vuelta. */
const CALLBACK_SCHEMES: Record<string, string> = {
  browser: 'vela://',
  ftp: 'vela-ftp://',
};

// POST /auth/magic-link
authRouter.post('/magic-link',
  rateLimitMagicLink,
  rateLimitMagicLinkByEmail,
  async (req, res) => {
    const { email, app } = req.body as { email?: string; app?: string };
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }
    // Sin `app` es Vela Browser: los clientes anteriores no lo mandan.
    const appId = app === undefined ? 'browser' : app;
    if (!CALLBACK_SCHEMES[appId]) {
      return res.status(400).json({ error: 'app desconocida' });
    }

    const db = getDb();
    const emailLower = email.toLowerCase().trim();

    // Crear usuario si no existe.
    db.prepare(`
      INSERT INTO users (id, email, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(email) DO UPDATE
      SET last_seen_at = excluded.created_at
    `).run(nanoid(), emailLower, Date.now());

    const user = db.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).get(emailLower) as { id: string };

    // Invalidar tokens anteriores del mismo usuario.
    db.prepare(`
      UPDATE magic_link_tokens
      SET used = 1
      WHERE user_id = ? AND used = 0
    `).run(user.id);

    // Crear nuevo token.
    const token = nanoid(32);
    const expiresAt = Date.now() + 15 * 60 * 1000;

    db.prepare(`
      INSERT INTO magic_link_tokens
        (token, user_id, email, expires_at, app)
      VALUES (?, ?, ?, ?, ?)
    `).run(token, user.id, emailLower, expiresAt, appId);

    try {
      await sendMagicLink(emailLower, token);
    } catch (e) {
      console.error('Error enviando email:', e);
      return res.status(500).json({ error: 'Error enviando el email' });
    }

    res.json({ ok: true, message: 'Email enviado. Revisa tu bandeja.' });
  }
);

// GET /auth/verify?token=XXX
authRouter.get('/verify', rateLimitVerify, (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    return res.status(400).send('Token inválido');
  }

  const db = getDb();
  const record = db.prepare(`
    SELECT user_id, app FROM magic_link_tokens
    WHERE token = ? AND used = 0
      AND expires_at > ?
  `).get(token, Date.now()) as { user_id: string; app: string | null } | undefined;

  if (!record) {
    return res.status(400).send('El enlace ha caducado o ya fue utilizado.');
  }

  db.prepare(`
    UPDATE magic_link_tokens
    SET used = 1 WHERE token = ?
  `).run(token);

  const sessionToken = createSession(record.user_id);

  // El protocolo de la aplicación captura este redirect en el cliente.
  const scheme = CALLBACK_SCHEMES[record.app ?? 'browser'] ?? CALLBACK_SCHEMES.browser;
  res.redirect(`${scheme}sync-callback?token=${sessionToken}`);
});

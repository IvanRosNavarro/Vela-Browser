import { Router } from 'express';
import { nanoid } from 'nanoid';
import { getDb } from '../db/database';
import { sendMagicLink } from '../email/resend';
import { createSession } from './sessions';
import {
  rateLimitLoginPoll,
  rateLimitMagicLink,
  rateLimitMagicLinkByEmail,
  rateLimitVerify,
} from '../middleware/rate-limit';

export const authRouter = Router();

/** Validez del enlace y de la sesión pendiente de recoger. */
const TOKEN_TTL_MS = 15 * 60 * 1000;
/** Cadencia de sondeo recomendada a los clientes. */
const POLL_INTERVAL_MS = 2_000;

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

    // Crear nuevo token. `login_id` es el secreto con el que la app que pidió
    // el enlace recoge la sesión por sondeo (ver migración 005).
    const token = nanoid(32);
    const loginId = nanoid(43);
    const expiresAt = Date.now() + TOKEN_TTL_MS;

    db.prepare(`
      INSERT INTO magic_link_tokens
        (token, user_id, email, expires_at, app, login_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(token, user.id, emailLower, expiresAt, appId, loginId);

    try {
      await sendMagicLink(emailLower, token);
    } catch (e) {
      console.error('Error enviando email:', e);
      return res.status(500).json({ error: 'Error enviando el email' });
    }

    res.json({
      ok: true,
      message: 'Email enviado. Revisa tu bandeja.',
      login_id: loginId,
      poll_interval_ms: POLL_INTERVAL_MS,
      expires_at: expiresAt,
    });
  }
);

// GET /auth/verify?token=XXX
authRouter.get('/verify', rateLimitVerify, (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    return res.status(400).send(page('Enlace no válido', 'Pide un enlace nuevo desde Vela.'));
  }

  const db = getDb();
  const record = db.prepare(`
    SELECT user_id, app, login_id FROM magic_link_tokens
    WHERE token = ? AND used = 0
      AND expires_at > ?
  `).get(token, Date.now()) as { user_id: string; app: string | null; login_id: string | null } | undefined;

  if (!record) {
    return res.status(400).send(
      page('El enlace ha caducado', 'Ya se usó o pasaron más de 15 minutos. Pide uno nuevo desde Vela.'),
    );
  }

  const sessionToken = createSession(record.user_id);
  const scheme = CALLBACK_SCHEMES[record.app ?? 'browser'] ?? CALLBACK_SCHEMES.browser;

  if (!record.login_id) {
    // Cliente anterior al sondeo: solo sabe recibir el token por el deep link.
    db.prepare('UPDATE magic_link_tokens SET used = 1 WHERE token = ?').run(token);
    return res.redirect(`${scheme}sync-callback?token=${sessionToken}`);
  }

  // Cliente con sondeo: la sesión espera en la fila hasta que la app la recoja.
  // El token ya no viaja en la URL (no queda en el historial del navegador).
  db.prepare(`
    UPDATE magic_link_tokens
    SET used = 1, session_token = ?, verified_at = ?
    WHERE token = ?
  `).run(sessionToken, Date.now(), token);

  res.send(page(
    'Listo, ya puedes volver a Vela',
    'Vela se conectará sola en unos segundos, aunque hayas abierto este enlace en otro navegador u otro dispositivo.',
    { href: `${scheme}sync-callback`, label: 'Volver a Vela' },
  ));
});

// POST /auth/magic-link/poll  { login_id }
//
// La app que pidió el enlace pregunta hasta que se pulse. Respuestas:
//   { status: 'pending' }            — aún no se ha pulsado
//   { status: 'verified', token }    — se entrega la sesión UNA sola vez
//   410 { status: 'expired' }        — caducó, se pidió otro enlace o ya se recogió
authRouter.post('/magic-link/poll', rateLimitLoginPoll, (req, res) => {
  const { login_id: loginId } = req.body as { login_id?: string };
  if (typeof loginId !== 'string' || loginId.length < 20 || loginId.length > 64) {
    return res.status(400).json({ error: 'login_id inválido' });
  }

  const db = getDb();
  const row = db.prepare(`
    SELECT token, expires_at, used, session_token, verified_at
    FROM magic_link_tokens WHERE login_id = ?
  `).get(loginId) as {
    token: string;
    expires_at: number;
    used: number;
    session_token: string | null;
    verified_at: number | null;
  } | undefined;

  const now = Date.now();
  if (!row) return res.status(410).json({ status: 'expired' });

  if (row.session_token) {
    // Recogida única: la sesión deja de estar en la fila en cuanto se entrega.
    db.prepare('UPDATE magic_link_tokens SET session_token = NULL WHERE token = ?').run(row.token);
    if (row.verified_at !== null && now - row.verified_at > TOKEN_TTL_MS) {
      return res.status(410).json({ status: 'expired' });
    }
    return res.json({ status: 'verified', token: row.session_token });
  }

  // Usado sin sesión pendiente = ya recogida o invalidado por un enlace nuevo.
  if (row.used === 1 || row.expires_at <= now) {
    return res.status(410).json({ status: 'expired' });
  }
  res.json({ status: 'pending' });
});

/** Página mínima para el navegador que abre el enlace. Solo interpola textos fijos. */
function page(title: string, body: string, action?: { href: string; label: string }): string {
  const button = action
    ? `<a href="${action.href}" style="display:inline-block;margin-top:20px;padding:12px 22px;border-radius:999px;background:#2d8a7a;color:#fff;text-decoration:none;font-weight:600">${action.label}</a>`
    : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Vela</title></head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#f4f5f8;color:#1b1d24;display:flex;min-height:100vh;align-items:center;justify-content:center">
<main style="max-width:420px;padding:32px;text-align:center">
<h1 style="font-size:22px;margin:0 0 12px">${title}</h1>
<p style="font-size:15px;line-height:1.5;color:#5a6070;margin:0">${body}</p>
${button}
</main></body></html>`;
}

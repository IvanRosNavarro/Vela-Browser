import { Request, Response, NextFunction } from 'express';

interface BucketEntry {
  count: number;
  resetAt: number;
}

type KeyFn = (req: Request) => string | null;

interface LimiterOptions {
  windowMs: number;
  limit: number;
  keyFn: KeyFn;
  message?: string;
  /** Si keyFn devuelve null, ¿dejar pasar (true) o bloquear (false)? */
  allowWhenNoKey?: boolean;
}

/**
 * Fábrica de rate-limiters en memoria por clave (IP, email, token…). Cada
 * limiter tiene su propio mapa de buckets; un barrido periódico purga los
 * expirados para no crecer sin límite.
 */
function createLimiter(opts: LimiterOptions) {
  const buckets = new Map<string, BucketEntry>();

  const interval = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (now > b.resetAt) buckets.delete(k);
    }
  }, 60 * 60 * 1000);
  // No mantener vivo el proceso solo por el barrido.
  if (typeof interval.unref === 'function') interval.unref();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const key = opts.keyFn(req);
    if (key === null) {
      if (opts.allowWhenNoKey === false) {
        res.status(400).json({ error: 'Petición inválida' });
        return;
      }
      next();
      return;
    }

    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }

    if (bucket.count >= opts.limit) {
      res.status(429).json({
        error: opts.message ?? 'Demasiadas peticiones. Inténtalo más tarde.',
      });
      return;
    }

    bucket.count++;
    next();
  };
}

// 5 peticiones de magic-link cada 10 min por IP.
export const rateLimitMagicLink = createLimiter({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  keyFn: (req) => req.ip ?? 'unknown',
  message: 'Demasiadas peticiones. Espera 10 minutos.',
});

// Y además, máximo 3 magic-links por email cada 10 min: impide email-bombing
// a una víctima concreta aunque el atacante rote IPs.
export const rateLimitMagicLinkByEmail = createLimiter({
  windowMs: 10 * 60 * 1000,
  limit: 3,
  keyFn: (req) => {
    const email = (req.body as { email?: string } | undefined)?.email;
    if (!email || typeof email !== 'string') return null;
    return `email:${email.toLowerCase().trim()}`;
  },
  message: 'Demasiados intentos para este email. Espera 10 minutos.',
  allowWhenNoKey: true, // el handler ya valida el formato del email
});

// Canje de tokens (/auth/verify): 30 intentos cada 10 min por IP — frena el
// token-grinding y el DoS sobre el endpoint que crea sesiones.
export const rateLimitVerify = createLimiter({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  keyFn: (req) => req.ip ?? 'unknown',
  message: 'Demasiados intentos. Espera unos minutos.',
});

// Relay de push (/push/:token): 60 entregas por minuto y token. Evita usar un
// token (que viaja por la infraestructura de push y es semi-público) como
// vector de flood/amplificación contra los dispositivos de la víctima.
export const rateLimitPushRelay = createLimiter({
  windowMs: 60 * 1000,
  limit: 60,
  keyFn: (req) => {
    const t = req.params.token;
    return t ? `push:${t}` : null;
  },
  message: 'Rate limit exceeded',
  allowWhenNoKey: false,
});

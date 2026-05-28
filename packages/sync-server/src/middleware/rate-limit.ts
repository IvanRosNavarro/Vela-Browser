import { Request, Response, NextFunction } from 'express';

interface BucketEntry {
  count: number;
  resetAt: number;
}

const magicLinkBuckets = new Map<string, BucketEntry>();

// 5 peticiones cada 10 minutos por IP.
export function rateLimitMagicLink(
  req: Request, res: Response, next: NextFunction
): void {
  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const limit = 5;

  const bucket = magicLinkBuckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    magicLinkBuckets.set(ip, {
      count: 1,
      resetAt: now + windowMs,
    });
    next();
    return;
  }

  if (bucket.count >= limit) {
    res.status(429).json({
      error: 'Demasiadas peticiones. Espera 10 minutos.',
    });
    return;
  }

  bucket.count++;
  next();
}

// Limpiar buckets expirados cada hora.
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of magicLinkBuckets) {
    if (now > bucket.resetAt) {
      magicLinkBuckets.delete(ip);
    }
  }
}, 60 * 60 * 1000);

import { describe, expect, it } from 'vitest';
import { buildCspHeader } from './csp';

// Copia literal de las políticas anteriores a vela-kit (ADR 0106). La cabecera
// generada con el kit debe tener exactamente las mismas directivas y fuentes.
const LEGACY_DEV_CSP: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'ws://localhost:*', 'http://localhost:*'],
  'style-src': ["'self'", "'unsafe-inline'"],
  'connect-src': [
    "'self'",
    'ws://localhost:*',
    'ws://cert-error',
    'http://localhost:*',
    'https://api.anthropic.com',
  ],
  'img-src': ["'self'", 'data:', 'blob:', 'vela:', 'vela-preview:', 'https:', 'http:'],
  'font-src': ["'self'", 'data:'],
  'frame-src': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
};

const LEGACY_PROD_CSP: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'connect-src': ["'self'", 'https://api.anthropic.com', 'https://*.anthropic.com'],
  'img-src': ["'self'", 'data:', 'blob:', 'vela:', 'vela-preview:', 'https:'],
  'font-src': ["'self'", 'data:'],
  'frame-src': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'upgrade-insecure-requests': [],
};

/** Parsea una cabecera CSP a directiva → conjunto de fuentes. */
function parseHeader(header: string): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const part of header.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    const [directive, ...sources] = tokens;
    if (!directive) continue;
    expect(result.has(directive), `directiva duplicada: ${directive}`).toBe(false);
    expect(new Set(sources).size, `fuentes duplicadas en ${directive}`).toBe(sources.length);
    result.set(directive, new Set(sources));
  }
  return result;
}

function toSets(policy: Record<string, string[]>): Map<string, Set<string>> {
  return new Map(Object.entries(policy).map(([d, s]) => [d, new Set(s)]));
}

describe('CSP de la shell', () => {
  it('desarrollo: mismas directivas y fuentes que antes de vela-kit', () => {
    expect(parseHeader(buildCspHeader(true))).toEqual(toSets(LEGACY_DEV_CSP));
  });

  it('producción: mismas directivas y fuentes que antes de vela-kit', () => {
    expect(parseHeader(buildCspHeader(false))).toEqual(toSets(LEGACY_PROD_CSP));
  });

  it('producción no permite eval ni scripts inline', () => {
    const script = parseHeader(buildCspHeader(false)).get('script-src');
    expect(script).toEqual(new Set(["'self'"]));
  });
});

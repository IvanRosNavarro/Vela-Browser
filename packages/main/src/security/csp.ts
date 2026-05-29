const DEV_CSP: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'",   // Vite HMR necesita inline
    "'unsafe-eval'",     // Vite dev necesita eval
    'ws://localhost:*',  // HMR WebSocket
    'http://localhost:*',
  ],
  'style-src': [
    "'self'",
    "'unsafe-inline'",   // Tailwind en dev
  ],
  'connect-src': [
    "'self'",
    'ws://localhost:*',
    'ws://cert-error',  // Chromium reporta conexiones WS fallidas (ej. HMR al reiniciar Vite) como este host
    'http://localhost:*',
    'https://api.anthropic.com',  // Fase 5 (stub)
  ],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'vela:',
    'vela-preview:',
    'https:',
    'http:',             // Favicons en dev
  ],
  'font-src': ["'self'", 'data:'],
  'frame-src': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
};

const PROD_CSP: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    // Sin unsafe-inline ni unsafe-eval en producción.
    // Los hashes de scripts inline se añaden aquí si
    // alguno es necesario tras el build.
  ],
  'style-src': [
    "'self'",
    "'unsafe-inline'",
    // unsafe-inline necesario para Tailwind JIT en producción
    // (los estilos se inyectan inline). Alternativa futura:
    // extraer CSS a archivos estáticos y quitar unsafe-inline.
  ],
  'connect-src': [
    "'self'",
    'https://api.anthropic.com',  // Fase 5
    'https://*.anthropic.com',
  ],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'vela:',
    'vela-preview:',
    'https:',
  ],
  'font-src': ["'self'", 'data:'],
  'frame-src': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'upgrade-insecure-requests': [],
};

export function buildCspHeader(isDev: boolean): string {
  const policy = isDev ? DEV_CSP : PROD_CSP;
  return Object.entries(policy)
    .map(([directive, sources]) =>
      sources.length > 0
        ? `${directive} ${sources.join(' ')}`
        : directive,
    )
    .join('; ');
}

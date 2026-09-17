import {
  BASE_DEV_CSP,
  BASE_PROD_CSP,
  buildCspHeader as buildKitCspHeader,
  extendCsp,
  type CspPolicy,
} from 'vela-kit/security';

// Las bases de la familia Vela viven en vela-kit (ADR 0106). Aquí solo se
// añaden las fuentes propias del navegador. `csp.test.ts` comprueba que la
// cabecera resultante tiene exactamente las directivas y fuentes de siempre.

export const DEV_CSP: CspPolicy = extendCsp(BASE_DEV_CSP, {
  'connect-src': [
    'ws://cert-error',  // Chromium reporta conexiones WS fallidas (ej. HMR al reiniciar Vite) como este host
    'https://api.anthropic.com',  // Fase 5 (stub)
  ],
  'img-src': [
    'vela:',
    'vela-preview:',
    'https:',
    'http:',             // Favicons en dev
  ],
});

export const PROD_CSP: CspPolicy = extendCsp(BASE_PROD_CSP, {
  // style-src mantiene 'unsafe-inline' (base del kit): Tailwind JIT inyecta
  // estilos inline. script-src sin unsafe-inline ni unsafe-eval.
  'connect-src': [
    'https://api.anthropic.com',  // Fase 5
    'https://*.anthropic.com',
  ],
  'img-src': [
    'vela:',
    'vela-preview:',
    'https:',
  ],
});

export function buildCspHeader(isDev: boolean): string {
  return buildKitCspHeader(isDev ? DEV_CSP : PROD_CSP);
}

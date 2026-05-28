# ADR 0039 — CSP estricta vía session.webRequest

## Estado
Aceptado — implementado en Fase 4.5.1

## Contexto
Vela necesita una Content-Security-Policy para la shell (páginas `vela://`).
La CSP en `<meta>` se descartó en Fase 0 porque bloqueaba el WebSocket del
HMR de Vite en desarrollo. La alternativa es inyectarla como cabecera HTTP
desde el main process mediante `session.webRequest.onHeadersReceived`.

## Decisión
- Dos políticas diferenciadas: **dev** (permisiva, permite `ws:` y
  `'unsafe-eval'` para Vite) y **prod** (estricta, sin `unsafe-eval`).
- Las políticas viven en `packages/main/src/security/csp.ts`.
- Se aplican en `onHeadersReceived` solo para URLs del esquema `vela:`.
- Las sesiones de tabs web externas NO reciben esta CSP: cada sitio lleva
  su propia política del servidor.
- Cabeceras adicionales en prod: `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: DENY`.

## Alternativas descartadas
- **CSP en `<meta>`**: bloqueaba el WebSocket de HMR. Descartada.
- **Una política única dev+prod**: imposible satisfacer HMR sin relajar
  prod. Descartada.
- **CSP solo en prod**: dificulta detectar violaciones durante el
  desarrollo. Descartada.

## Consecuencias
- En dev: HMR de Vite funciona sin restricciones.
- En prod: `unsafe-eval` eliminado; scripts externos bloqueados.
- Favicons (`img-src https:`), previews (`vela-preview:`), Custom CSS
  del usuario (`style 'unsafe-inline'`) y glassmorphism (sin recursos
  externos) funcionan con la política prod.

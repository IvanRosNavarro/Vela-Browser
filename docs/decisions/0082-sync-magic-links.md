# ADR 0082 — Autenticación con magic links vía Resend

## Estado
Aceptado — Fase 2

## Contexto
El servidor de sync necesita un mecanismo de autenticación. Opciones evaluadas:
1. **Contraseñas de cuenta**: clásico, requiere gestión de hashes, reset de contraseña, etc.
2. **OAuth (Google, GitHub)**: depende de terceros, complejidad de integración.
3. **Magic links**: el usuario introduce su email, recibe un enlace de un solo uso, click = autenticado.
4. **Passkeys**: moderno, sin soporte universal aún en Electron WebContents.

## Decisión
**Magic links enviados vía Resend.**

Flujo:
1. Usuario introduce email en `vela://settings#sync`.
2. Cliente llama `POST /auth/magic-link` con `{ email }`.
3. Servidor genera token JWT de 15 min, envía email con enlace `https://sync.vela-browser.com/auth/verify?token=XXX`.
4. El enlace redirige a `vela://sync-callback?token=XXX`.
5. El protocolo `vela:` en main intercepta la URL y completa la autenticación.
6. Se emite un session token JWT de larga duración (30 días, renovable).

Rate limit: 5 peticiones por email cada 15 minutos (429 al superar).

Resend (no SendGrid) porque tiene SDK oficial para Node.js con TypeScript nativo, plan gratuito generoso y excelente deliverability.

## Consecuencias
**Ventajas:**
- Sin contraseñas de cuenta: el email es el factor de identidad.
- Si el email se compromete, los datos siguen protegidos por la sync password (E2EE separado).
- Implementación mínima en el servidor: sin hashes de contraseña, sin reset flows.
- UX familiar para usuarios de Notion, Linear, etc.

**Desventajas:**
- Requiere acceso al email en cada nuevo dispositivo (pero no en renovaciones de sesión).
- Dependencia de Resend para entrega de email. Fallback manual no implementado en v1.0.

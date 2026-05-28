# ADR 0017 — Permiso push unificado con notificaciones web

**Estado:** Aceptado  
**Fase:** Sub-fase 4C.3b  
**Fecha:** 2026-05-12

## Contexto

En la Web, `Notification.requestPermission()` y `pushManager.subscribe()` son dos operaciones distintas, aunque en la práctica los sitios las invocan juntas. Chromium los modela como dos permisos separados (`notifications` y `push`).

Vela necesita decidir cómo exponer estos permisos al usuario.

## Opciones consideradas

**A. Dos gestos separados**: el usuario aprueba notifications y luego aprueba push en popover diferente.  
**B. Permiso unificado**: un solo gesto del usuario cubre ambos.

## Decisión

**Permiso unificado (Opción B)** con posibilidad de elegir "solo notificaciones web" si el usuario no quiere push.

## Razones

- **Cognitivamente más simple**: el usuario ve el icono de campana una vez y decide. Mostrar dos popovers seguidos sería confuso y podría llevar a denegar push por error cuando el usuario quería notificaciones.
- **Refleja la intención del sitio**: cuando un sitio solicita ambos, su intención es recibir push. Separarlos artificialmente crea una experiencia incoherente.
- **El usuario avanzado puede optar por solo notificaciones web**: el popover de decisión, cuando el sitio solicitó push, ofrece tres opciones: "Permitir notificaciones y push", "Solo notificaciones (sin push)", "Denegar". El usuario tiene control total.

## Implementación

Cuando `permission === 'push'` llega a `setPermissionRequestHandler` en `sessions.ts`:
- Si el origin ya tiene `notifications: 'granted'` → se concede push automáticamente (el usuario ya decidió).
- Si no → se marca `hasPushRequest = true` en el `PendingRequest` de ese origin. El icono de campana muestra el popover de 3 opciones en lugar de 2.

Cuando el usuario elige en el popover:
- **Notificaciones + push**: `grantPermission(origin, { withPush: true })` → NotificationManager intenta capturar la suscripción VAPID ejecutando JS en el webContents.
- **Solo notificaciones**: `grantPermission(origin, { withPush: false })` → permiso normal.
- **Denegar**: `denyPermission(origin)`.

## Estado visual del icono

| Estado | Descripción |
|--------|-------------|
| `none` | Sin permiso y sin solicitud |
| `pending` | Sitio solicitó permission (notif o push) |
| `granted` | Notificaciones activas, sin push |
| `denied` | Permiso denegado |
| `push-active` | Notificaciones activas + suscripción push en `push_subscriptions` |

El 5.º estado `push-active` se representa con un punto de 5px del color accent en la esquina superior derecha del icono de campana.

## Consecuencias

- `NotificationPermissionState` amplía el union con `'push-active'`.
- `MainEventPayloads[NOTIFICATION_PERMISSION_PENDING]` incluye `hasPushRequest: boolean`.
- `NOTIFICATIONS_GRANT_PERMISSION` acepta `{ origin, withPush? }`.
- La UI `vela://settings#privacy > Notificaciones web` no muestra sitios con solo push; `vela://settings#privacy > Push notifications` muestra los que tienen suscripción activa.

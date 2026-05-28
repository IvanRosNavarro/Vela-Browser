# ADR 0019 — Notificaciones web: denegación silenciosa por defecto

**Estado:** Aceptado
**Fase:** Sub-fase 4C.3
**Fecha:** 2026-05-12

## Contexto

Los navegadores convencionales delegan la gestión de permisos de notificaciones al sistema
operativo: cuando un sitio llama a `Notification.requestPermission()`, aparece un popup nativo
que pide al usuario que permita o bloquee. El usuario promedio rechaza el 95 % de estas
peticiones tras varios clics de "No permitir".

Vela necesita decidir cómo manejar esta petición.

## Opciones consideradas

**A. Popup nativo**: comportamiento estándar de Chromium. El SO muestra el diálogo, el
usuario decide en el momento.

**B. Popup custom en la UI de Vela**: interceptar `setPermissionRequestHandler` y denegar
inmediatamente, pero mostrar un popup propio en la URL bar que ofrezca la misma decisión.

**C. Denegación silenciosa** (elegida): interceptar y denegar sin interrumpir al usuario.
El icono de campana en la URL bar cambia a estado `pending` (animación pulse) para indicar
que hay una solicitud pendiente. El usuario activa explícitamente si quiere.

## Decisión

Se implementa la **Opción C**: denegación silenciosa + icono de campana como señal pasiva.

## Razones

- **Menos interrupciones**: el 95 % de las peticiones de permiso son rechazadas. Un popup
  inmediato interrumpe sin aportar valor la mayoría de las veces.
- **Control del usuario cuando quiere**: el icono de campana hace visible que el sitio
  pidió permiso. El usuario decide en su momento, no en el del sitio.
- **Consistente con el model mental de Vela**: Vela intercepta también las notificaciones
  del SO para enrutarlas al centro propio. Es coherente que también controle el permiso.

## Implementación

En `packages/main/src/profiles/sessions.ts`, la función `configureSessionDefaults` registra
`session.setPermissionRequestHandler`. Cuando `permission === 'notifications'`:
1. Se invoca `callbacks.onNotificationRequest(webContentsId, origin)` si está registrado.
2. `NotificationManager.registerPendingRequest` guarda la solicitud y emite
   `IPC_EVENTS.NOTIFICATION_PERMISSION_PENDING` para que el renderer actualice el icono.
3. Se llama a `callback(false)` — Chromium ve el permiso denegado.

El permiso real se concede/deniega más tarde vía `NOTIFICATIONS_GRANT_PERMISSION` /
`NOTIFICATIONS_DENY_PERMISSION` IPC, que a su vez llama a
`session.setPermissionOverridesForOrigin`.

## Estados del icono de campana

| Estado       | Descripción                                                     |
|--------------|-----------------------------------------------------------------|
| `none`       | Sin solicitud ni permiso                                        |
| `pending`    | Sitio solicitó permiso (animación pulse); aún no decidido       |
| `granted`    | Permiso concedido; notificaciones van al centro de Vela         |
| `denied`     | Permiso denegado explícitamente por el usuario                  |
| `push-active`| Notificaciones + suscripción push activa (ver ADR 0015)         |

## Consecuencias

- El estado `pending` persiste hasta que el usuario interactúa con el popover de la campana.
  Si el usuario cierra la ventana sin decidir, el estado se descarta (no persiste en disco).
- Las reglas de silencio (por horario, workspace o temporal) afectan solo a la entrega de
  notificaciones ya concedidas, no al icono de permiso pendiente.
- Sitios que asumen que el popup se muestra inmediatamente (y verifican el resultado antes de
  continuar) pueden comportarse inesperadamente. Es un trade-off asumido.

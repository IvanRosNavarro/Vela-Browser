# ADR 0015 — Push Notifications: Enfoque A (solo con Vela abierto)

**Estado:** Aceptado  
**Fase:** Sub-fase 4C.3b  
**Fecha:** 2026-05-12

## Contexto

Sub-fase 4C.3 implementó notificaciones web (Notification API directa).  
La siguiente extensión natural es Push API + Service Workers + VAPID, que permite recibir notificaciones aunque la tab esté cerrada.

Existen dos enfoques posibles:

### Enfoque A — Solo con Vela abierto
Interceptamos el push cuando Vela ya está ejecutándose. El SW Chromium recibe el mensaje push y Vela lo redirige al centro de notificaciones antes de que llegue al SO.

### Enfoque B — Proceso background (post-1.0)
Un proceso auxiliar ligero se registra como receptor push del SO (Windows Task Scheduler / launchd en macOS / systemd en Linux), recibe pushes aunque Vela esté cerrado, y los encola para cuando Vela arranque.

## Decisión

Se implementa **Enfoque A** para el MVP.

## Razones

- **Complejidad desproporcionada de Enfoque B**: requiere un ejecutable diferente por plataforma, registrado en el sistema de inicio del SO (Task Scheduler en Windows, launchd en macOS, systemd en Linux). Además de la complejidad de firma y autoupdates del helper.
- **Suficiente para MVP**: la mayoría de los sitios que usan push (notificaciones de mensajes, alertas, updates) son relevantes mientras el usuario está activo. Las notificaciones llegadas "en frío" se verán al abrir Vela de todas formas.
- **Degradación elegante**: si el SW intenta mostrar una notificación y Vela está cerrado, la notificación llega al SO por la vía normal de Chromium. El usuario la ve, pero no pasa por el centro de Vela. Es aceptable.

## Limitaciones conocidas

### Interceptación de `notification-show`

En Electron 42, el nombre del evento de sesión para interceptar notificaciones de SW no está confirmado. La implementación usa `notification-show` en `sessions.ts` con un cast explícito porque el tipo `Session` de Electron no lo declara públicamente. Si el nombre es incorrecto, las notificaciones push llegarán al SO directamente (sin pasar por el centro de Vela), pero el sistema de suscripciones seguirá funcionando. Verificar en la documentación de Electron 42 y ajustar si es necesario.

### Restauración de suscripciones

`PushSubscriptionManager.restoreSubscriptions` actualmente solo registra un log informativo. En Electron 42 no hay una API directa para notificar a Chromium que restaure suscripciones push de una sesión particionada — el SW las restaura solo desde su propio storage (IndexedDB). La BD de Vela sirve para mostrar información al usuario en `vela://settings#privacy`, no para la restauración técnica.

## Consecuencias

- Las suscripciones push se almacenan en `push_subscriptions` de `profile.db`.
- El campo `source` en `notifications` distingue `'web'` de `'push'`.
- `NotificationPermissionState` tiene un 5.º valor: `'push-active'`.
- Enfoque B queda explícitamente como post-1.0.

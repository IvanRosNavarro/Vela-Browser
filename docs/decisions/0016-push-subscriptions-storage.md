# ADR 0016 — Almacenamiento de suscripciones push en profile.db

**Estado:** Aceptado  
**Fase:** Sub-fase 4C.3b  
**Fecha:** 2026-05-12

## Contexto

Cada suscripción push generada por `pushManager.subscribe()` incluye:
- **endpoint**: URL del servidor push del proveedor (FCM, Mozilla, etc.)
- **p256dh**: clave pública ECDH de Diffie-Hellman usada por el servidor para cifrar el mensaje
- **auth**: secreto de autenticación

Chromium almacena estas claves en su propio storage (IndexedDB del SW). Vela necesita registrarlas también para:
1. Mostrar al usuario qué sitios tienen push activo (`vela://settings#privacy`).
2. Actualizar `last_push_at` cuando llega un push.
3. Separar el estado `'push-active'` de `'granted'` en el icono de campana.

## Decisión

Las suscripciones se almacenan en la tabla `push_subscriptions` de `profile.db` (el mismo SQLite por perfil). **No se sincronizan entre dispositivos** en Fase 2.

## Razones

### Aislamiento por perfil
Los permisos push son por sesión de Chromium, que ya está particionada por perfil. Una suscripción del Perfil A no tiene sentido en el Perfil B.

### Las claves VAPID son específicas del par cliente-servidor
`p256dh` y `auth_secret` son generadas por Chromium para el par (dispositivo, servidor push). Sincronizarlas a otro dispositivo no funcionaría: ese par no puede descifrar mensajes dirigidos al original. Solo la lista de orígenes con permiso concedido tiene sentido sincronizar.

### Almacenamiento de claves
Las claves se guardan como BLOB en SQLite pero **no se cifran a nivel Vela**: el cifrado real de los mensajes push lo hace Chromium usando estas claves internamente. Vela solo las almacena como registro de qué suscripciones existen. Si un perfil tiene contraseña maestra, `profile.db` está protegida por el cifrado de volumen del SO (FileVault / BitLocker / LUKS) — suficiente para este nivel de sensibilidad.

## Plan Fase 2 (sync)

En Fase 2 se puede sincronizar la **lista de orígenes con notificaciones concedidas** (no las claves VAPID). Al instalar Vela en un dispositivo nuevo y abrir un perfil sincronizado, los sitios apareceran en `settings#notifications` con permiso concedido. El usuario deberá visitar cada sitio y hacer click en "Activar push" para crear una nueva suscripción en el nuevo dispositivo — esto es lo correcto desde el punto de vista de seguridad.

## Consecuencias

- `push_subscriptions` vive en migración 004, junto al `ALTER TABLE notifications ADD COLUMN source`.
- `PushSubscriptionRepository` expone CRUD sincrónico (node:sqlite).
- `PushSubscriptionManager` abstrae el acceso per-perfil a través de `ProfileManager.getRepositories`.

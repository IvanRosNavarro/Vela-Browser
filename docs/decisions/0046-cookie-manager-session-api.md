# ADR 0046 — Cookie Manager: session.cookies como API de acceso

## Estado
Aceptado — implementado en Fase 4.5.4c

## Contexto
El Cookie Manager nativo (ADR 0045) necesita leer, escribir y eliminar
cookies, y recibir notificaciones de cambios en tiempo real. Existen
varias APIs disponibles en Electron para esto.

## Decisión
- Acceso directo a `session.cookies` desde el main process.
- API utilizada: `cookies.get(filter)`, `cookies.set(details)`,
  `cookies.remove(url, name)`, evento `cookies.on('changed', cb)`.
- El handler IPC `cookies:get-for-tab` obtiene la sesión del perfil
  activo (`session.fromPartition('persist:profile-{uuid}')`) y consulta
  cookies para la URL activa.
- El push IPC `cookies:changed` se emite al renderer cuando
  `cookies.on('changed')` dispara con `removed: false` o `removed: true`.
- No se usa preload ni permisos MV3 para este acceso.

## Alternativas descartadas
- **Preload + chrome.cookies**: requiere permisos MV3 y declaración en
  manifest. Más restricciones que `session.cookies`. Descartado.
- **CDP Network.getCookies**: viable pero añade complejidad de CDP
  session. `session.cookies` es más simple y suficiente. Descartado.
- **Polling en lugar de evento**: ineficiente para detectar cambios
  externos (ej. cookies creadas por JS de la página). Descartado.

## Consecuencias
- Acceso completo a cookies de la sesión del perfil activo.
- Notificaciones en tiempo real sin polling.
- El panel se actualiza automáticamente cuando JS de la página crea
  o elimina cookies mientras el panel está abierto.

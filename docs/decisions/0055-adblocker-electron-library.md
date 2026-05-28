# ADR 0055 — Ad blocker: @cliqz/adblocker-electron sobre extensión MV3

## Estado
Aceptado — Fase 5.0.2

## Contexto
Necesitamos bloquear anuncios y trackers. Las opciones principales son:
- **Extensión MV3** (bundlear uBlock Origin o similar).
- **Librería nativa** adjunta a la sesión de Electron vía `session.webRequest`.

## Decisión
Usar `@cliqz/adblocker-electron` (MIT) adjuntado directamente a cada sesión de perfil mediante `ElectronBlocker.fromPrebuiltAdsAndTracking()`.

## Consecuencias
**Ventajas:**
- Sin overhead de proceso de extensión ni IPC cross-extension.
- Control total desde el main process: pausar, añadir excepciones, contar bloqueos en tiempo real.
- Filtros EasyList + EasyPrivacy + uBlock Origin Filters ya incluidos en el prebuilt.
- Licencia MIT, compatible con GPL-3.0.

**Desventajas:**
- No hereda actualizaciones automáticas de la comunidad (hay que descargar listas periódicamente).
- Las reglas de excepciones del usuario no son compatibles con el formato `.ubl` de extensiones.

**Alternativa descartada:** extensión MV3 bundleada. Añade complejidad de ciclo de vida de extensión, no permite exponer contadores nativos al renderer sin IPC adicional, y Manifest V3 restringe el uso de `webRequest` bloqueante.

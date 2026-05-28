# ADR-0021: Sistema de previews de pestañas

## Estado
Aceptado — implementado en Sub-fase 4B.

## Contexto

El modal MRU (Ctrl+Tab) necesita mostrar capturas visuales de cada pestaña para que el
usuario identifique de un vistazo qué contiene cada una sin necesidad de activarla. Las
opciones consideradas fueron:

1. **NativeImage + JPEG en disco** — Electron expone `webContents.capturePage()` que
   devuelve un `NativeImage`. Se puede serializar a JPEG con `toJPEG(quality)`. No
   requiere dependencias externas.
2. **WebP nativo** — No existe API pública de WebP en Electron sin recompilar Chromium
   o añadir una native addon. Descartado.
3. **En memoria (Map<tabId, Buffer>)** — Viable para sesiones cortas, pero pierde todas
   las capturas al reiniciar y crece sin límite con muchas pestañas. Descartado.

## Decisión

Almacenar capturas como JPEG en disco bajo
`userData/profiles/{profileId}/previews/{tabId}.webp` (la extensión `.webp` se mantiene
por compatibilidad futura, aunque el contenido es JPEG). Servir las imágenes al renderer
a través de un protocolo custom `vela-preview://`.

### Detalles de implementación

**`PreviewCapturer`** (`packages/main/src/previews/PreviewCapturer.ts`):
- Throttling: máximo una captura por tab cada 5 segundos (`lastCaptureAt` Map).
- Cola FIFO de capturas para evitar concurrencia (`processQueue`).
- `webContents.capturePage()` → `image.resize({ width, height })` → `toJPEG(quality)`.
- Dimensiones y calidad configurables por el usuario en Settings → Pestañas.

**`PreviewStore`** (`packages/main/src/previews/PreviewStore.ts`):
- Directorio: `userData/profiles/{profileId}/previews/`.
- Un fichero por tab: `{tabId}.webp`.
- `listOrphans(activeTabs)`: compara ficheros en disco contra tabs activas; devuelve los
  IDs sin tab correspondiente. Llamado en el job de limpieza horario.

**`previewProtocol`** (`packages/main/src/protocols/previewProtocol.ts`):
- Protocolo `vela-preview://` registrado globalmente con `protocol.handle('vela-preview')`.
- URL format: `vela-preview://{profileId}/{tabId}`.
- `Content-Type: image/webp` (independientemente del contenido real JPEG).
- También registrado en cada sesión de perfil via `ensurePreviewProtocolOnSession` para
  que los WCV puedan cargarlo.
- Devuelve 404 si no existe captura; el renderer muestra favicon-card como fallback.

**Ciclo de vida**:
- **Al cambiar de tab**: `TabManager.activateTab` captura la tab que deja de estar activa.
- **`did-finish-load`**: captura diferida 2 s para que la página termine de renderizar.
- **Antes de descartar** (`discardTab`): captura inmediata (bypass de throttle).
- **Al cerrar tab** (`closeTab`): `store.delete(tabId)`.
- **Huérfanos**: job cada hora recorre `listOrphans` y elimina ficheros sin tab activa.

### Protocolo de acceso desde renderer

```
<img src="vela-preview://{profileId}/{tabId}" />
```

Peticiones desde contenido web externo son bloqueadas por la restricción de sesión
(el protocolo solo está disponible en la sesión del renderer shell, no en sesiones de
perfil de usuario salvo que `ensurePreviewProtocolOnSession` lo registre explícitamente).

## Consecuencias

- El disco crece ~10 KB por tab activa (JPEG 320×200 a calidad 70).
- Reiniciar la app no pierde previews; el renderer las muestra instantáneamente.
- Si `webContents.capturePage()` falla (tab descargada, WCV destruido), la captura se
  omite silenciosamente; la UI recurre al favicon-card.
- Migración futura a WebP real: basta con cambiar `toJPEG` → `toDataURL('image/webp')`
  si Electron expone la API, sin cambio de protocolo ni store.

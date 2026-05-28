# ADR-0022: Captura de pantalla con editor de anotaciones

## Estado
Aceptado — implementado en Sub-fase 4B.

## Contexto

Vela necesita captura de pantalla nativa sin depender de extensiones de terceros.
Los requisitos son:

1. Capturar solo el área visible de la pestaña activa.
2. Capturar un área seleccionada por el usuario (crosshair).
3. Capturar la página completa incluyendo el scroll.
4. Editor de anotaciones post-captura antes de exportar.

## Decisión

**Captura** vía `webContents.capturePage()` para visible y región, y vía CDP
(`Page.captureScreenshot` con `captureBeyondViewport: true`) para página completa.
**Editor** implementado con Konva.js (`react-konva`) por ser la única librería de
canvas 2-D con React bindings, licencia MIT y sin deps nativas.

### Tres modos

**Modo Visible** (`screenshot:capture-visible`):
- `TabManager.captureVisibleForWindow(windowId)` → `webContents.capturePage()`.
- Devuelve PNG en base64.

**Modo Selección** (`screenshot:capture-region`):
- El renderer muestra un overlay transparente sobre el WCV (usando `useOverlayStore`).
- El usuario dibuja un rectángulo; el renderer envía las coordenadas a main.
- `TabManager.captureRegionForWindow(windowId, { x, y, width, height })` usa
  `capturePage({ x, y, width, height })`.

**Modo Página completa** (`screenshot:capture-full-page`):
- `TabManager.captureFullPageForWindow(windowId)` conecta el debugger CDP, llama
  `Page.captureScreenshot({ format: 'png', captureBeyondViewport: true })`.
- Si CDP falla (tab interna, permisos), fallback a `captureVisibleForWindow`.

### Editor de anotaciones (`ScreenshotEditor.tsx`)

Implementado con `react-konva`. Herramientas disponibles:

| Herramienta | Implementación Konva |
|------------|---------------------|
| Flecha     | `Arrow` |
| Recuadro   | `Rect` |
| Círculo    | `Ellipse` |
| Texto      | `Text` editable inline |
| Resaltado  | `Rect` con opacidad 0.35 |
| Blur       | `Rect` + post-proceso: escalado 1/8 y reescalado × 8 (pixelado); no hay API de blur nativa en Konva |

- Historial de deshacer/rehacer: stack de `Annotation[][]`.
- Color y grosor de trazo configurables en la toolbar.
- Selección y reposicionamiento de anotaciones con `Transformer`.

### Exportación

| Acción | IPC |
|--------|-----|
| Guardar PNG/JPEG | `screenshot:save-file` → `dialog.showSaveDialog` + `fs.writeFile` |
| Copiar al portapapeles | `screenshot:copy-image` → `clipboard.writeImage` |
| Copiar como Markdown | Generado en renderer: `` ![captura](data:image/png;base64,…) `` |

### Atajo de teclado

`Ctrl+Shift+S` definido en el command registry central como `screenshot:capture`
(Sub-fase 4B). El overlay se cierra con `Esc`.

## Consecuencias

- CDP requiere que el debugger no esté ya adjuntado. Si DevTools está abierta en la
  misma tab, `captureFullPage` cae al fallback visible.
- Konva añade ~200 KB gzip al bundle del renderer. Aceptable para MVP.
- El blur pixelado es visualmente inferior a un blur gaussiano real. Anotado como
  TODO para Fase 5 si se integra canvas offscreen.
- La acción "Copiar como Markdown" genera data URIs potencialmente muy grandes para
  páginas completas largas; el usuario queda advertido en la UI.

# ADR 0020 — Popups de extensiones vía ECE activateClick

**Estado:** Aceptado
**Fase:** Sub-fase 4C.4 / 4C.5
**Fecha:** 2026-05-12

## Contexto

Las extensiones de Chrome pueden tener un popup de browser action (el panel que aparece al
hacer click en su icono en la barra de herramientas). Vela muestra los iconos de las
extensiones en la title bar y necesita abrir este popup al hacer click.

Se evaluaron dos enfoques:

### Enfoque A — WebContentsView embebido en el renderer
Crear un WCV en el renderer que cargue la URL del popup de la extensión (`chrome-extension://…`).
El renderer controla la posición y el ciclo de vida del panel.

Problemas: el WCV es una capa nativa que flota sobre el HTML (ADR en CLAUDE.md). Posicionarlo
sobre el icono de la title bar requeriría enviar coordenadas absolutas al main y calcular bounds
dinámicamente. Además, muchas extensiones esperan que el popup se abra como ventana propia con
`window.close()` disponible.

### Enfoque B — BrowserWindow tipo 'popup' manual
Crear un `BrowserWindow` con `type: 'popup'` que cargue la URL del popup. El main controla la
geometría. Al perder el foco, se cierra.

Funciona, pero requiere reimplementar la negociación de APIs `chrome.*` que las extensiones
esperan en un contexto de popup (extensión activa, `chrome.runtime.connect`, etc.).

### Enfoque C — ECE activateClick (elegido)
`electron-chrome-extensions` ya implementa la lógica completa de popup de browser action. La
API privada `browserAction.activateClick({ extensionId, tabId, anchorRect })` crea y posiciona
el popup correctamente, conecta el contexto de extensión y gestiona el ciclo de vida.

## Decisión

Se usa **ECE `activateClick`** para abrir popups de extensiones.

## Razones

- **Compatibilidad máxima con chrome.***: ECE conecta el contexto de extensión correctamente.
  Los popups que usan `chrome.runtime`, `chrome.tabs`, `chrome.storage`, etc. funcionan sin
  adaptar nada.
- **Mínimo código propio**: toda la lógica de posicionamiento, tamaño y destrucción del popup
  la gestiona ECE internamente.
- **Consistencia**: ECE ya gestiona el resto de las APIs de extensión. El popup es una pieza
  más del mismo sistema.

## Implementación

El handler `extensions:open-popup` en `packages/main/src/ipc/extensions.ts` accede a la API
privada de ECE:

```typescript
const ecePrivate = ElectronChromeExtensions.fromSession(session) as EcePrivate;
ecePrivate.api?.browserAction?.activateClick({
  extensionId,
  tabId: -1,           // sin tab activa específica
  anchorRect,          // coordenadas del icono en pantalla
  alignment: 'bottom',
});
```

El renderer envía `anchorRect` (coordenadas del botón del icono) desde
`ExtensionActionButton.tsx` usando `getBoundingClientRect()` al llamar al IPC.

## Limitaciones conocidas

- `EcePrivate` es una interfaz local que castea la instancia ECE. Si ECE cambia su API interna
  entre versiones, el cast puede romper silenciosamente. Revisar al hacer bump de ECE.
- `tabId: -1` significa que el popup no tiene tab de contexto. La mayoría de las extensiones
  lo manejan bien; aquellas que dependen de `chrome.tabs.query({active: true})` pueden ver
  resultados inesperados si no hay tab activa.

## Consecuencias

- No se registra `BrowserWindow` manual para popups de extensiones.
- El botón de engranaje en la title bar (abrir `vela://extensions`) es un botón propio del
  renderer, no de ECE.
- Si ECE depreca `activateClick`, el fallback natural sería el Enfoque B (BrowserWindow manual).

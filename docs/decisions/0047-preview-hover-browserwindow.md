# ADR 0047 — Preview hover de pestaña como BrowserWindow hijo

## Estado
Aceptado — implementado en Fase 4.5.4d

## Contexto
Al pasar el cursor sobre una pestaña en la sidebar, Vela muestra una
miniatura con la captura de pantalla de esa tab. El problema es que los
WebContentsView (WCV) son capas nativas del sistema operativo que flotan
por encima de todo el HTML del renderer. Ningún elemento DOM puede
superponerse a un WCV mediante `z-index` CSS, sin importar su valor.

## Decisión
El preview hover se implementa como una **BrowserWindow hija** por
ventana principal:
- `parent: mainWindow` — la BW hija sigue a la ventana principal.
- `frame: false` — sin borde ni barra de título.
- `transparent: true` — esquinas redondeadas via CSS, sin fondo de SO.
- `focusable: false` — el cursor no interactúa con la preview; los
  eventos de ratón pasan al renderer de abajo.
- `alwaysOnTop: false` — suficiente con ser hijo de mainWindow para
  aparecer sobre el WCV.
- Una sola BW de preview por ventana principal (singleton), reutilizada
  mediante IPC `tab-preview:update` al cambiar de tab en hover.
- Carga la página `vela://tabpreview`.

## Alternativas descartadas
- **Elemento DOM con `z-index` alto**: el WCV siempre lo tapa. No
  funciona con ningún valor de z-index. Descartado.
- **Reducir bounds del WCV**: desplaza el contenido web y es
  visualmente disruptivo para un popover temporal. Descartado.
- **BrowserWindow `alwaysOnTop: true`**: aparece sobre otras
  aplicaciones del SO, no solo sobre el WCV de Vela. Descartado.

## Consecuencias
- El preview es siempre visible sobre el contenido web, incluyendo
  cuando hay un WCV activo, modal MRU o Tab Switcher abiertos.
- NUNCA implementar previews de sidebar como elementos DOM sobre el WCV.
- Al abrir una nueva ventana principal, crear su propia BW de preview
  (no compartir entre ventanas).

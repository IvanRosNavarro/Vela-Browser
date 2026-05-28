# ADR-0024: Menú contextual custom del WebContentsView

## Estado
Aceptado — implementado en Sub-fase 4B.

## Contexto

El WCV no dispara el menú contextual nativo de Electron en su propio proceso (el evento
`context-menu` ocurre en el `WebContents` del WCV). Se necesita un menú rico con:

- Navegación (atrás/adelante/recargar).
- Acciones sobre enlaces (nueva pestaña, nueva ventana, otro perfil, copiar).
- Acciones sobre imágenes (copiar, guardar, abrir en nueva tab).
- Acciones sobre texto seleccionado (copiar, buscar en motor).
- Acciones sobre campos editables (cortar, copiar, pegar).
- Inspeccionar elemento posicionado.
- Guardar página, imprimir.

Las opciones consideradas:
1. **`electron.Menu.buildFromTemplate`** — Menú nativo del SO; no permite estilos
   custom ni integración con el diseño de Vela. Descartado.
2. **HTML en el renderer sobre el WCV** — El WCV es una capa nativa que siempre flota
   encima del HTML del renderer. Requeriría `useOverlayStore` y relayout. Complejo.
3. **`BrowserWindow` popup custom** — Ventana transparente sin marco que renderiza
   HTML propio. Permite estilos totalmente custom y posicionamiento preciso.

## Decisión

Implementar el menú como una `BrowserWindow` popup (`ContextMenuPopup.ts`) con
`transparent: true`, `frame: false`, `skipTaskbar: true`.

### Flujo

1. El `WebContents` del WCV emite `context-menu` con `params` (tipo de contenido,
   coordenadas, enlaces, selección, etc.).
2. `TabManager.webContextMenu` captura el evento, calcula la posición en pantalla y
   llama a `ContextMenuPopup.show(params, windowBounds)`.
3. `ContextMenuPopup` crea (o recicla) la `BrowserWindow` popup, serializa los `params`
   en `ipcMain.handle('ctx:get-params')` y la muestra en la posición calculada.
4. El HTML del popup llama `ipcRenderer.invoke('ctx:get-params')`, construye el DOM del
   menú dinámicamente y se autoredimensiona (`ctx:resize`) según su contenido.
5. Al hacer clic en un ítem, el popup envía `ctx:action` con el payload serializado.
6. `ContextMenuPopup` reenvía la acción al handler IPC `context-menu:exec`, que la
   despacha al `TabManager` o abre ventanas/perfiles según el tipo.
7. El popup se cierra: al hacer clic fuera (`blur`), al seleccionar un ítem, o al
   presionar `Esc`.

### Separadores limpios

Los ítems se añaden condicionalmente según el contexto (`params.mediaType`,
`params.linkURL`, `params.selectionText`, etc.). Una función `cleanSeparators`
elimina separadores duplicados y los que aparecen al inicio/final del menú.

### Hooks de extensiones

`electron-chrome-extensions` (versión actual) no expone `getContextMenuItems()`.
Las extensiones que registran ítems de menú contextual vía `chrome.contextMenus` no
se integran con este menú. Pendiente revisión cuando ECE lo soporte; ver
`docs/pending.md`.

### Acciones implementadas

| Tipo de acción | Implementación |
|----------------|---------------|
| `nav:back/forward/reload` | `wc.goBack()` / `wc.goForward()` / `wc.reload()` |
| `link:open-tab` | `tabManager.createTab(...)` |
| `link:open-window` | `profileWindowManager.openWindow(profileId)` → `createTab` |
| `link:open-profile` | `profileWindowManager.openWindow(targetProfileId)` → `createTab` |
| `link:copy` | `clipboard.writeText(url)` |
| `image:copy` | `wc.copyImageAt(x, y)` |
| `image:save` | `dialog.showSaveDialog` + `wc.downloadURL` |
| `image:open-tab` | `tabManager.createTab(...)` con la URL de la imagen |
| `text:copy` | `wc.copy()` |
| `text:search` | Navega a `{engineUrl}?q={selección}` en nueva tab |
| `edit:cut/copy/paste` | `wc.cut()` / `wc.copy()` / `wc.paste()` |
| `page:save` | `wc.savePage(filePath, 'HTMLComplete')` |
| `page:print` | `wc.print()` |
| `devtools:inspect` | `wc.openDevTools({ mode: 'detach' })` + `wc.inspectElement(x, y)` |

## Consecuencias

- La ventana popup tiene una penalización de ~10-20 ms la primera vez que se crea;
  se recicla en aperturas sucesivas.
- En sistemas con DPI scaling, las coordenadas se ajustan con `screen.getDisplayNearestPoint`
  para evitar desplazamiento del menú respecto al cursor.
- Los hooks de extensiones quedan pendientes hasta que ECE los soporte. Items como
  "Bloquear imagen con uBlock" o "Guardar en Bitwarden" no aparecen aún.

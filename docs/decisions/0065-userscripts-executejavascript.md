# ADR 0065 — Userscripts vía executeJavaScript e insertCSS

## Estado
Aceptado — Fase 5.0.5

## Contexto
Los userscripts necesitan inyectar JS y CSS en páginas web. Las opciones son: ejecutar en el preload (acceso a Node), o ejecutar vía `webContents.executeJavaScript` / `webContents.insertCSS` (contexto web puro).

## Decisión
- **JS**: `webContents.executeJavaScript(code, false)` — sin `userGesture`, en el contexto web de la página. Sin acceso a Node ni a Electron.
- **CSS**: `webContents.insertCSS(css)` — inyectado en el documento.
- **Momento de inyección**: `document-start` (via `webContents.on('did-start-navigation')`), `document-end` (via `did-finish-load`), o `document-idle` (postMessage con delay).
- **Match de URL**: patrón estilo Chrome extensions (`*://example.com/*`). Evaluado en main antes de inyectar.

## Consecuencias
**Ventajas:**
- Los scripts no pueden acceder a APIs de Electron ni a Node, limitando el blast radius si un script es malicioso.
- El usuario revisa el código antes de instalarlo (diálogo de confirmación con código visible).
- Compatible con scripts de Greasy Fork/Tampermonkey sin modificación.

**Desventajas:**
- Sin acceso a `GM_*` APIs de Greasemonkey. Userscripts que dependen de esas APIs no funcionarán sin shim.
- Los errores de JS en el script no se propagan al main process de forma nativa; se capturan vía console listener en el preload y se emiten al renderer.

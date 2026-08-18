# 0095 — Sincronización de la pestaña activa con electron-chrome-extensions

Fecha: 2026-08-18
Estado: aceptado

## Contexto

Las extensiones consultan qué pestaña está activa con
`chrome.tabs.query({ active: true })` (Bitwarden lo hace antes de cada
autofill). `electron-chrome-extensions` (ECE) responde a esa consulta
desde dos estructuras internas:

- `store.windowToActiveTab`: `WeakMap<BrowserWindow, WebContents>`.
- `store.tabDetailsCache`: `Map<tabId, details>`, donde `details.active`
  es el campo que filtra `query()`.

Vela no usa el modelo de pestañas que ECE asume. Cada pestaña es un
`WebContentsView` que se materializa de forma perezosa, y hay rutas que
crean el WCV **sin** que la pestaña pase a estar activa: restaurar
pestañas suspendidas, abrir en el panel no enfocado del Split View,
restauración de sesión al arrancar.

El problema está en `TabsAPI.observeTab`, que ECE ejecuta para toda
pestaña recién registrada y que termina llamando a `onActivated(tabId)`
sin condición alguna. Es decir: **cualquier** WCV que Vela materialice
—aunque nazca en segundo plano— pasa a ser, para ECE, la pestaña activa
de su ventana. A partir de ese momento Bitwarden autorrellena la pestaña
equivocada, o no encuentra ninguna.

El código anterior ya forzaba `tabDetailsCache` al activar una pestaña,
pero marcaba `active = false` en **todas** las entradas del cache, que en
ECE es por sesión y no por ventana. Con dos ventanas del mismo perfil,
activar una pestaña en la ventana A dejaba a la ventana B sin ninguna
pestaña activa hasta que el usuario cambiase de pestaña allí.

## Decisión

La fuente de verdad de "qué pestaña está activa" es `TabManager`, nunca
ECE. `packages/main/src/index.ts` mantiene dos funciones:

- `applyActiveTabToExtensions(webContents, win)`: llama a `selectTab` y
  además reescribe `windowToActiveTab` y `tabDetailsCache`. El barrido
  del cache se limita a las pestañas **de esa ventana** (comparando
  `store.tabToWindow`), de modo que las demás ventanas del perfil
  conservan la suya.
- `reassertActiveTabToExtensions(win)`: consulta a
  `tabManager.getActiveTabWebContents(win.id)` y reaplica lo anterior.

Se invoca `reassertActiveTabToExtensions`:

- en `onTabAttached`, justo después de `addTab`, para deshacer el
  `onActivated` incondicional de ECE cuando la pestaña nace en segundo
  plano;
- al enfocar una ventana, porque ECE actualiza su `lastFocusedWindowId`
  con el evento `focus` pero no reevalúa la pestaña activa.

## Consecuencias

- Se depende de la forma interna de `ctx.store` de ECE, que no es API
  pública. Está aislada en `EceStore` / `getEceStore()` y todos los
  accesos son opcionales: si una versión futura cambia la estructura, el
  efecto es perder la corrección, no romper el arranque. Al subir de
  versión de `electron-chrome-extensions` hay que revisar este punto.
- El coste del barrido es O(pestañas de la ventana) y solo ocurre al
  cambiar de pestaña, adjuntar una nueva o enfocar una ventana.
- No se toca el parche de `patches/electron-chrome-extensions@4.9.0.patch`:
  la corrección vive en código propio y sobrevive a un rebase del parche.

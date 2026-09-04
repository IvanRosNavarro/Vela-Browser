# 0098 — Integración de Vela con electron-chrome-extensions: hooks de aplicación y limpieza del parche

Fecha: 2026-08-28
Estado: aceptado, con la limpieza del parche revertida en el ADR 0103

> **Revisión (2026-09-04)**: la parte de este ADR que desmontaba el parche de
> `electron-chrome-extensions` queda revertida. El parche no era solo una
> reimplementación de APIs que Electron 42 ya trae: contenía un apaño
> deliberado (`tabs.sendMessage` devolviendo `undefined`) que empujaba a
> Bitwarden a usar `scripting.executeScript`. Sin él, su popup se queda con la
> lista de elementos vacía. Los hooks de `ChromeExtensionImpl` que describe el
> resto del documento siguen vigentes. Ver ADR 0103.

## Contexto

`ElectronChromeExtensions` (ECE) se construía solo con `{ license, session }`.
Su constructor acepta además una `ChromeExtensionImpl`: los hooks con los que
la aplicación anfitriona implementa lo que la librería no puede saber (cómo se
crea una pestaña, cuál es su índice, qué significa cerrarla). Sin ellos:

- `chrome.tabs.create` lanzaba `createTab is not implemented`. Ninguna
  extensión podía abrir pestañas — Bitwarden lo usa para abrir el vault, la
  ayuda y los popouts de reprompt de contraseña.
- `chrome.tabs.remove` y `chrome.tabs.update({ active: true })` manipulaban el
  `WebContents` por detrás de `TabManager`, que es la fuente de verdad del
  árbol.
- `assignTabDetails` no existía, así que `pinned` era siempre `false`, `index`
  siempre `-1` y `active` dependía de reescribir a mano el cache interno de
  ECE (ADR 0095).

En paralelo, el parche de la librería (`patches/electron-chrome-extensions@4.9.0.patch`,
178 líneas) sustituía dos APIs que Electron 42 **sí** implementa:

- `chrome.tabs.sendMessage` se reemplazaba por un wrapper con firma
  `(tabId, message, options)` que descartaba el cuarto argumento, el callback.
  Bitwarden usa siempre la forma con callback (`BrowserApi.tabSendMessage`), de
  modo que el mensaje llegaba al content script, este respondía, y la respuesta
  se perdía: la promesa quedaba colgada para siempre. Medido con una extensión
  de prueba: con ECE el callback no se invocaba nunca; con Electron puro sí.
- `chrome.scripting` entero se reemplazaba por un relay que serializaba `func`
  a texto y lo ejecutaba con `executeJavaScript`, es decir **en el mundo
  principal de la página**, ignorando el parámetro `world` y dejando el código
  de la extensión al alcance de la web.

Se verificó que el `chrome.scripting` nativo de Electron 42 cubre todo lo que
el relay imitaba: `files`, `func` + `args`, `frameIds`, `allFrames`, `world`
`MAIN` e `ISOLATED`, `insertCSS`, `removeCSS` y `registerContentScripts`.

Por último, la misma extensión podía cargarse dos veces: la migración inicial
copia las extensiones del bundle a `profiles/{uuid}/extensions/`, y
`loadExtensions` seguía cargándolas también desde `EXTENSIONS_DIR`. Como el ID
de Chrome de una extensión desempaquetada se deriva de su ruta, las dos copias
tenían **IDs distintos**: dos service workers, dos juegos de content scripts y
dos backgrounds compitiendo por los mismos mensajes.

## Decisión

**1. Implementar la `ChromeExtensionImpl` completa** en
`buildExtensionsImpl(session)` (`packages/main/src/index.ts`). Todos los hooks
delegan en `TabManager`:

- `createTab`: crea la pestaña en una ventana **del perfil de esa sesión**. Si
  nace en segundo plano (`active: false`), Vela la crearía descartada y sin
  `WebContentsView`; como la API de Chrome obliga a devolver un `WebContents`,
  se materializa sin activarla con `TabManager.materializeTab`.
- `selectTab` / `removeTab`: `activateTab` / `closeTab`. `removeTab` ignora la
  llamada si el `WebContents` ya está destruido, porque ECE dispara el mismo
  hook tanto en `chrome.tabs.remove()` como al destruirse la pestaña.
- `createWindow` / `removeWindow`: `ProfileWindowManager.openWindow` y cierre.
- `assignTabDetails`: rellena `active`, `pinned`, `index`, `windowId` y
  `title` desde `TabManager.getExtensionTabInfo()`. Con Split View se
  consideran activas las pestañas visibles de ambos paneles.

Para evitar la reentrada — ECE llama a `impl.selectTab` también cuando somos
nosotros los que le contamos cuál es la pestaña activa, y al observar una
pestaña nueva — hay una bandera `sincronizandoTabActiva` que envuelve las
llamadas de Vela hacia ECE (`addTab`, `selectTab`). Sin ella, materializar una
pestaña en segundo plano la activaría en la interfaz.

`applyActiveTabToExtensions` (ADR 0095) pasa a **invalidar** las entradas de
`tabDetailsCache` de esa ventana en lugar de reescribir su campo `active`: al
regenerarse, el cache pasa por `assignTabDetails` y toma los datos de
`TabManager`.

**2. Retirar del parche los dos overrides.** `chrome.tabs.sendMessage` y
`chrome.scripting` vuelven a ser los nativos de Electron. El parche queda
reducido a su único cambio necesario: `sandbox: false` en el `PopupView`.

**3. Deduplicar la carga de extensiones.** `loadExtensions` salta cualquier
carpeta del bundle cuya extensión ya esté cargada en esa sesión. La identidad
se calcula con el **hash SHA-256 de su `manifest.json`**: no sirve el ID de
Chrome (deriva de la ruta) ni el nombre (Electron y nosotros podríamos
resolver un `__MSG_*__` con locales distintos, cosa que ocurrió al intentarlo).

El resolutor de mensajes i18n que había en `ipc/extensions.ts` se extrajo a
`extensions/manifestI18n.ts` para poder reutilizarlo.

## Consecuencias

- Las extensiones pueden abrir y cerrar pestañas y ventanas, y lo que abren
  aparece en el árbol de Vela como cualquier otra pestaña.
- `chrome.tabs.create({ active: false })` materializa el `WebContentsView` de
  inmediato en lugar de dejar la pestaña descartada. Es lo que hace Chrome
  (arranca el renderer de una pestaña abierta de fondo) y lo que exige la API.
- El parche de la librería pasa de 178 a 12 líneas: mucho menos que rebasar al
  subir de versión, y sin APIs propias que diverjan de las de Chrome.
- El código de las extensiones deja de ejecutarse en el mundo principal de las
  páginas.
- Sigue habiendo dependencia de internals de ECE en dos puntos: el cache de
  pestañas (ADR 0095) y el `ctx.router` para emitir `commands.onCommand`
  (ADR 0099). Ambos aislados y con acceso opcional.

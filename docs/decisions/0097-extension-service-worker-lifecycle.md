# 0097 — Ciclo de vida de los service workers de extensiones MV3

Fecha: 2026-08-28
Estado: aceptado

## Contexto

El autorrelleno de Bitwarden fallaba de forma intermitente: el popup abría,
mostraba las sugerencias correctas del dominio y, al pulsar "Fill", respondía
*"Unable to autofill the selected item on this page. Copy and paste the
information instead."* (`autofillError` en su catálogo de mensajes). El mismo
sitio y la misma pestaña unas veces funcionaban y otras no.

El fallo es reproducible de forma determinista: con la página recién cargada
el autorrelleno funciona; unos 95 segundos después, falla siempre.

### Por qué

Bitwarden obtiene los campos del formulario pidiéndoselos a sus content
scripts (`collectPageDetails`) y descarta la operación si no recibe respuesta
en 1 s. Sus content scripts, al inyectarse, abren un port con el service
worker:

```js
// content-message-handler.js
const port = chrome.runtime.connect({ name: "autofill-injected-script-port" });
port.onDisconnect.addListener(() => {
  // se desmonta: quita sus listeners de chrome.runtime.onMessage
});
```

Chromium duerme el service worker de una extensión MV3 tras ~30 s sin
actividad. **En Chrome un port abierto prolonga la vida del worker**, así que
mientras haya pestañas con content scripts el worker de Bitwarden no se
duerme. En Electron el port no lo prolonga: el worker muere, sus ports se
desconectan y los content scripts se desmontan solos.

A partir de ahí la extensión sigue viva en la barra de herramientas — su
popup abre y `chrome.tabs.query` responde, porque eso lo sirve el proceso
principal — pero está sorda en la página. De ahí el síntoma: sugerencias
correctas, autorrelleno imposible.

Se descartaron por medición otras hipótesis: la mensajería tab↔extensión
funciona (un content script recién inyectado responde), `document.hidden` es
`true` en los WebContentsView pero no impide la recolección, y el nivel de
`chrome.scripting` es correcto.

## Decisión

Emular el comportamiento efectivo de Chrome: **mantener en marcha el service
worker de las extensiones que dependen de sus content scripts**.

`packages/main/src/extensions/serviceWorkerKeeper.ts` escucha
`session.serviceWorkers.on('running-status-changed')` y, cuando un worker pasa
a `stopped`, lo vuelve a arrancar con `startWorkerForScope`. Condiciones:

- Solo extensiones cuyo manifest declara `content_scripts` **y**
  `background.service_worker`. Un gestor de cookies o un tema no pierden nada
  por dormirse.
- Solo con **Vela en primer plano** (`BrowserWindow.getFocusedWindow()`). Con
  el navegador de fondo se deja dormir al worker y se reactiva al recuperar el
  foco (`app.on('browser-window-focus')`), para no gastar CPU mientras el
  usuario no está usando el navegador.
- Con un mínimo de 5 s entre reactivaciones del mismo worker, como cortafuegos
  ante un bucle de arranque/parada.

El evento solo trae `versionId`, así que el scope se resuelve consultando
`getAllRunning()` mientras el worker sigue listado (deja de estarlo al
pararse).

Además, `packages/main/src/extensions/wakeServiceWorker.ts` despierta el
worker **bajo demanda** justo antes de usar la extensión, en dos puntos donde
la orden nace en el proceso principal y por tanto no despertaría al worker por
sí sola:

- al abrir el popup de una extensión (`extensions:open-popup`);
- al disparar uno de sus atajos de teclado (ver ADR 0099). Un worker dormido
  no tiene listeners registrados en el router de ECE, así que el evento se
  perdería en silencio.

No hace falta en los caminos que nacen en la página: un
`chrome.runtime.sendMessage` desde un content script o desde el popup sí
despierta al worker, igual que los eventos de pestaña que emite ECE, que
llaman a `startWorkerForScope` antes de entregar.

## Consecuencias

- Con Vela en primer plano, el worker de cada extensión con content scripts se
  reinicia aproximadamente cada 30 s (medido: 5 arranques en 150 s). Cada
  arranque hace que la extensión rehaga su inicialización; en Bitwarden eso
  incluye reinyectar sus content scripts en las pestañas abiertas. Es el
  precio de que el autorrelleno funcione siempre.
- Con Vela en segundo plano el coste es cero.
- Limitación conocida: si se abre el popup de la extensión en el primer
  segundo tras devolverle el foco a Vela, la extensión puede no haber
  terminado de reinicializarse y el autorrelleno fallar ese primer intento.
- Se depende de `session.serviceWorkers.getAllRunning()` y del evento
  `running-status-changed`, ambos API pública de Electron.
- Si una versión futura de Electron hiciera que los ports prolonguen la vida
  del worker (comportamiento de Chrome), este módulo pasa a ser innecesario y
  puede retirarse sin tocar nada más.

## Diagnóstico de problemas futuros

`VELA_DEBUG_EXT=1` vuelca al log de Vela la consola de los service workers de
todas las extensiones. Es la única forma de ver qué le ocurre al background de
una extensión sin abrirle DevTools a mano, y fue lo que permitió aislar este
fallo.

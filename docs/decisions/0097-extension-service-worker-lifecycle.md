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

Mantener vivo el service worker con **`ServiceWorkerMain.startTask()`**
(`packages/main/src/extensions/serviceWorkerKeepAlive.ts`). Su contrato en
Electron es literalmente *"initiate a task to keep the service worker alive
until ended"*: mientras la tarea no se cierre, Chromium no lo duerme. Es el
equivalente exacto de lo que en Chrome consigue un port abierto.

- Se adquiere al recibir `running-status-changed` con estado `running`, y
  también para los workers que ya estuvieran en marcha al adjuntarse a la
  sesión.
- Solo para extensiones cuyo manifest declara `content_scripts` **y**
  `background.service_worker`. Un gestor de cookies o un tema no pierden nada
  por dormirse.
- La tarea no se cierra nunca mientras la extensión esté cargada.

Complemento menor: `packages/main/src/extensions/wakeServiceWorker.ts` arranca
el worker antes de entregar un **atajo de teclado** de la extensión (ADR 0099),
porque ese evento nace en el proceso principal y un worker dormido no tiene
listeners registrados en el router de ECE. Es best-effort: si falla, el atajo
simplemente no llega.

### Dos vías descartadas, y por qué

Ambas se publicaron y ambas hubo que revertirlas. Conviene dejarlas escritas
porque las dos parecían razonables:

**1. Reactivar el worker al pararse (v0.1.21).** Escuchaba el paso a `stopped`
y llamaba a `startWorkerForScope`. **Rompió Bitwarden por completo.**
Reactivar no es prolongar: Chromium paraba el worker igual, así que el
resultado era un reinicio cada 30 s, y **cada arranque destruye el estado en
memoria del worker**. Bitwarden guarda ahí el vault descifrado, de modo que no
llegaba a terminar de inicializarse antes del siguiente reinicio y su popup
abría con la lista de elementos **vacía**, siempre. Medido con una extensión de
prueba con estado en memoria: arranque cada 30 s exactos y pérdida completa del
estado en cada uno.

**2. Despertar el worker justo antes de abrir el popup (v0.1.22).** Un
`await startWorkerForScope()` en `extensions:open-popup`, más un margen para
que la extensión reinyectara. Funcionaba en la máquina de desarrollo, pero en
la del usuario `startWorkerForScope` **fallaba de forma sistemática**
(`Failed to start service worker`, 7 veces entre sus dos perfiles) y, al fallar
justo en ese instante, el popup abría sin background: vault vacío otra vez. Es
una llamada que no se puede dar por buena, y en el camino del popup no aporta
nada, porque el propio popup de Bitwarden despierta al worker con su mensaje
`popupOpened`.

Regla que queda: **nunca reiniciar el service worker de una extensión**.
Reiniciarlo es destructivo para cualquier extensión con estado en memoria, que
es justo la categoría que más nos importa que funcione. Prolongar su vida sí es
seguro, y para eso está `startTask()`.

## Consecuencias

- El worker de las extensiones con content scripts no se duerme mientras Vela
  está abierto, igual que en Chrome. Su estado en memoria —el vault descifrado
  de Bitwarden -- se conserva entre usos.
- Coste: la memoria de ese worker se mantiene ocupada. Es el mismo coste que en
  Chrome, donde el port abierto produce el mismo efecto.
- No hay reinicios, así que las extensiones no rehacen su inicialización ni
  reinyectan sus content scripts periódicamente.
- `startTask()` está marcado como `@experimental` en Electron. Si desapareciera
  o cambiara de firma, el efecto sería volver al comportamiento anterior
  (autorrelleno intermitente), no romper el arranque: la llamada está envuelta
  en try/catch.
- Verificado en Vela: tras 120 s el worker sigue vivo con un único arranque y
  `collectPageDetails` responde correctamente al abrir el popup.

## Diagnóstico de problemas futuros

`VELA_DEBUG_EXT=1` vuelca al log de Vela la consola de los service workers de
todas las extensiones. Es la única forma de ver qué le ocurre al background de
una extensión sin abrirle DevTools a mano, y fue lo que permitió aislar este
fallo.

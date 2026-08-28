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

Despertar el worker **bajo demanda**, justo antes de usar la extensión, en los
dos puntos donde la orden nace en el proceso principal y por tanto no lo
despertaría por sí sola (`packages/main/src/extensions/wakeServiceWorker.ts`):

- al abrir el popup de una extensión (`extensions:open-popup`);
- al disparar uno de sus atajos de teclado (ver ADR 0099). Un worker dormido no
  tiene listeners registrados en el router de ECE, así que el evento se
  perdería en silencio.

No hace falta en los caminos que nacen en la página: un
`chrome.runtime.sendMessage` desde un content script o desde el popup sí
despierta al worker, igual que los eventos de pestaña que emite ECE, que llaman
a `startWorkerForScope` antes de entregar.

Al arrancar en frío, la extensión rehace su inicialización y reinyecta sus
content scripts, y eso no es instantáneo: si el popup se abriera en ese mismo
instante preguntaría antes de que la página volviese a responder. Por eso, y
**solo cuando el worker estaba realmente parado**, se espera un margen de
1,2 s antes de abrir el popup. Cuando ya corría —el caso normal— no se paga
nada.

### Lo que NO se hace: mantener el worker vivo

La primera versión de este ADR (publicada en v0.1.21) mantenía el worker en
marcha reactivándolo con `startWorkerForScope` en cuanto pasaba a `stopped`,
emulando el efecto que en Chrome tienen los ports abiertos. **Rompía Bitwarden
por completo** y hubo que revertirlo en v0.1.22.

El motivo: reactivar no es lo mismo que prolongar. Chromium para el worker de
todos modos, así que el resultado era un ciclo de arranque cada ~30 s, y **cada
arranque destruye todo el estado en memoria del worker**. Bitwarden guarda ahí
el vault descifrado y su clave de sesión, de modo que no llegaba a terminar de
inicializarse antes del siguiente reinicio: el popup abría con la lista de
elementos **vacía**, siempre.

Medido con una extensión de prueba que guarda estado en memoria: arranque cada
30 s exactos y pérdida completa del estado en cada uno.

Regla general que queda: **nunca forzar el ciclo de vida del service worker de
una extensión**. Reiniciarlo es destructivo para cualquier extensión con estado
en memoria, que es justo la categoría que más nos importa que funcione.

## Consecuencias

- El worker duerme cuando debe dormir y la extensión conserva su estado entre
  usos, como en Chrome.
- Tras un rato largo de inactividad, el popup de una extensión tarda ~1,2 s de
  más en abrirse la primera vez. Las siguientes son inmediatas.
- Queda un caso sin cubrir: si el usuario interactúa con la **página** (por
  ejemplo el menú inline de Bitwarden dentro de un campo) estando el worker
  dormido, el primer clic solo sirve para despertarlo. Ese camino nace en el
  content script, así que se recupera solo, pero puede requerir un segundo
  intento.
- Se depende de `session.serviceWorkers.getAllRunning()` y
  `startWorkerForScope`, ambos API pública de Electron.
- Si una versión futura de Electron hiciera que los ports prolonguen la vida
  del worker (comportamiento de Chrome), este módulo pasa a ser innecesario.

## Diagnóstico de problemas futuros

`VELA_DEBUG_EXT=1` vuelca al log de Vela la consola de los service workers de
todas las extensiones. Es la única forma de ver qué le ocurre al background de
una extensión sin abrirle DevTools a mano, y fue lo que permitió aislar este
fallo.

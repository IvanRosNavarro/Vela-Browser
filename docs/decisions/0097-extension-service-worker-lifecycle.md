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

**No tocar el ciclo de vida del service worker de las extensiones.** Tres
intentos de hacerlo, los tres publicados y los tres revertidos, dejaron el
popup de Bitwarden con la lista de elementos vacía en el equipo del usuario.
El autorrelleno intermitente descrito en el contexto sigue sin resolverse, pero
es un mal mucho menor que un gestor de contraseñas que no muestra nada.

Lo único que se conserva es `extensions/wakeServiceWorker.ts`, y solo para los
**atajos de teclado** de las extensiones (ADR 0099): ese evento nace en el
proceso principal y un worker dormido no tiene listeners registrados en el
router de ECE, así que se perdería en silencio. Es best-effort y no está en el
camino de ninguna interfaz.

### Tres vías descartadas, y por qué

**1. Reactivar el worker al pararse (v0.1.21).** Escuchaba el paso a `stopped`
y llamaba a `startWorkerForScope`. Reactivar no es prolongar: Chromium paraba
el worker igual, así que el resultado era un reinicio cada 30 s, y **cada
arranque destruye el estado en memoria del worker**. Bitwarden guarda ahí el
vault descifrado, de modo que no llegaba a terminar de inicializarse antes del
siguiente reinicio. Medido con una extensión de prueba con estado en memoria:
arranque cada 30 s exactos y pérdida completa del estado en cada uno.

**2. Despertar el worker antes de abrir el popup (v0.1.22).** Un
`await startWorkerForScope()` en `extensions:open-popup`. Funcionaba en la
máquina de desarrollo, pero en la del usuario esa llamada **falla de forma
sistemática** (`Failed to start service worker`, 7 veces entre sus dos
perfiles) y, al fallar justo en ese instante, el popup abría sin background.
En ese camino además no aporta nada: el propio popup de Bitwarden despierta al
worker con su mensaje `popupOpened`.

**3. Mantenerlo vivo con `ServiceWorkerMain.startTask()` (v0.1.23).** Sobre el
papel es la solución correcta —su contrato es *"keep the service worker alive
until ended"*, el equivalente a lo que en Chrome consigue un port abierto— y en
la máquina de desarrollo se comportó como se esperaba: tras 120 s el worker
seguía vivo con un único arranque y `collectPageDetails` respondía. En el
equipo del usuario el log confirma que la tarea se adquiere
(`service worker retenido: chrome-extension://…/`) y **el vault sigue saliendo
vacío**. No se llegó a determinar por qué.

### Lección

Las tres veces el patrón de error fue el mismo: validar con una extensión de
prueba que no reproduce lo que hace Bitwarden de verdad —sin estado en memoria,
sin vault que descifrar, en una máquina donde las llamadas no fallan— y dar por
bueno el resultado. **Cualquier cambio que toque el ciclo de vida de un service
worker de extensión debe verificarse contra una instalación real de Bitwarden
con sesión iniciada antes de publicarse.** Un banco de pruebas sintético no
sirve para esto.

## Consecuencias

- El autorrelleno de Bitwarden sigue fallando cuando el worker lleva un rato
  dormido: el popup abre con las sugerencias correctas y al pulsar "Fill"
  responde "Unable to autofill the selected item on this page". La vía de
  trabajo es copiar y pegar, o recargar la página antes de rellenar.
- A cambio, el vault se lista siempre, que es el comportamiento previo a todo
  esto.
- Queda pendiente entender por qué `startWorkerForScope` falla en unas
  instalaciones y no en otras, y por qué `startTask()` no produce el mismo
  efecto en ambas. Ver `docs/pending.md`.

## Diagnóstico de problemas futuros

`VELA_DEBUG_EXT=1` vuelca al log de Vela la consola de los service workers de
todas las extensiones. Es la única forma de ver qué le ocurre al background de
una extensión sin abrirle DevTools a mano, y fue lo que permitió aislar este
fallo.

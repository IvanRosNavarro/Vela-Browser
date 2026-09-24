# ADR 0120 — Control multimedia por frames y puente de Media Session

- Estado: aceptado (sustituye la parte de control del ADR 0033)
- Fecha: 2026-09-23
- Versión: v0.2.9

## Contexto

El widget de la title bar existía desde el ADR 0033, pero el reproductor no
reproducía: los tres botones del popup llamaban a `onActivate`, es decir,
llevaban a la pestaña. `play`, `pause`, `skipNext`, `skipPrev` y `seekBy`
estaban implementados en el main, expuestos por IPC y sin un solo consumidor.
Alrededor de eso había seis defectos más: la fuente no se borraba al navegar
(el icono ♩ se quedaba encendido hasta cerrar la pestaña), cualquier `<video>`
decorativo mudo creaba una fuente, `seekBy` saltaba el doble (el puente del
preload saltaba 15 s y `executeJavaScript` volvía a saltar el delta), el popup
no filtraba por perfil, su alto era un número fijo de 420 px y la barra de
progreso no era clicable.

El ADR 0033 dejó dos limitaciones apuntadas como irresolubles: los iframes de
otro origen y el cambio de pista. Cuatro meses después el ADR 0109 (PiP) ya
había resuelto la primera para su caso sin que nadie llevara la mejora aquí.

## Decisión

**Los comandos se ejecutan sobre el frame que tiene el elemento**
(`media/mediaFrames.ts`), con el patrón que `PipManager` ya usaba: recorrer
`wc.mainFrame.framesInSubtree` y actuar con `WebFrameMain.executeJavaScript(…,
true)`. El `userGesture` aporta la activación que exige la política de
autoplay, y el recorrido por frames alcanza los iframes de otro origen. Esto
cubre Spotify Web y los reproductores embebidos, que el preload del frame
principal no veía.

**Un solo camino por comando.** El receptor de `media:command` del preload se
retira. Tener las dos vías a la vez era lo que duplicaba los saltos. El preload
conserva el poller de metadata del frame principal, que es barato y reactivo.

**Puente de Media Session para el cambio de pista.** Se envuelven
`setActionHandler` y `setPositionState` en el mundo de la página para poder
invocar después los handlers reales. Es la única vía posible:

- Los handlers registrados no se pueden leer desde la API pública.
- Una tecla multimedia inyectada con `sendInputEvent` llega al renderer como un
  `keydown` corriente y nunca se convierte en una acción de Media Session: esa
  ruta vive en el browser process de Chromium, que Electron no expone.
- Mover `currentTime` al final no cambia de canción en Spotify ni en YouTube:
  reutilizan un único elemento con MediaSource, así que no hay "siguiente
  elemento" al que saltar.

El puente se instala con `executeJavaScript`, que corre en el mundo de la
página **sin pasar por su CSP**, así que no hay que tocar cabeceras ni adjuntar
el debugger CDP. Solo captura lo que se registre a partir de ese momento, y por
eso se reinstala en cada `media-started-playing`: los reproductores vuelven a
registrar sus handlers en cada pista. Vive en un global no enumerable con
nombre aleatorio por ejecución, para no dar a los sitios una huella con la que
reconocer Vela — misma razón que el switch `disable-blink-features=
AutomationControlled`.

**La UI no finge.** `MediaSource` lleva `canSkipNext`, `canSkipPrev` y
`canSeek`. Si la página no registró el handler, el botón sale apagado con su
motivo en el tooltip en vez de hacer algo que no funciona.

**Qué entra en el widget** (`isWorthShowing`, lógica pura con tests): lo que
suena, lo que se declara reproductor con Media Session, y lo que tiene pista de
audio propia sin silenciar. El banner que se autorreproduce mudo se queda
fuera. Una pestaña que empieza a sonar más tarde se recoge por
`audio-state-changed`.

**Ciclo de vida:** la fuente se borra en `did-start-navigation` del frame
principal, no solo al destruirse la pestaña.

**Popup:** el perfil viaja en la URL (`vela://media-popup?profileId=…`) y el
alto sale del contenido — `itemCount` al abrir para el tamaño inicial y el alto
real medido con un `ResizeObserver` después, nunca una constante.

## Consecuencias

- Play, pausa y salto funcionan en cualquier sitio, iframes incluidos.
- Siguiente y anterior funcionan donde la página registra sus handlers, que es
  lo que hacen los reproductores de verdad. Donde no, el botón sale apagado.
- El sondeo de posición toca un solo frame, el que manda, cacheado por pestaña.
- Si un sitio registra sus handlers antes del primer `media-started-playing` y
  no vuelve a registrarlos nunca, el puente no los ve y el salto de pista
  queda apagado en esa pestaña. La alternativa sería el CDP
  `Page.addScriptToEvaluateOnNewDocument`, descartado: mantener el debugger
  adjunto a todas las pestañas de un navegador de uso general es una huella
  para los sistemas antibot.
- Sigue sin haber integración con los controles del sistema operativo (SMTC en
  Windows, teclas multimedia del teclado). Chromium lo tiene tras los flags
  `HardwareMediaKeyHandling` y `MediaSessionService`, que Chrome activa por
  defecto y Electron no. Pendiente de probar.

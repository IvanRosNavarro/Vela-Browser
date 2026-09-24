# ADR 0121 — Arrastrar enlaces y ficheros desde fuera

- Estado: aceptado
- Fecha: 2026-09-24
- Versión: v0.2.10

## Contexto

Arrastrar un enlace o un fichero desde otra aplicación hasta el navegador y que
se abra en una pestaña es una costumbre de toda la vida. Vela no lo hacía, y
además lo hacía **mal**: soltar un fichero sobre la ventana dejaba que Chromium
navegase la shell a `file://…`, con lo que la interfaz entera desaparecía hasta
reiniciar. Es decir, había que implementarlo aunque solo fuera para taparlo.

## Decisión

**La zona de drop es la chrome, no el contenido.** Se aceptan drops sobre la
sidebar y la barra de título; el área del `WebContentsView` se deja a la
página, como en Chrome. Meter ahí el drop obligaría a interceptarlo desde el
preload de cada pestaña y le quitaría a las webs su propio arrastrar y soltar
—subir un adjunto a un correo, por ejemplo—, que es peor negocio que la
comodidad que se gana.

**Red de seguridad global.** `App.tsx` traga `dragover` y `drop` en `window`.
Las zonas que sí aceptan paran el evento antes; lo demás muere ahí y la shell
ya no puede navegarse por accidente.

**La ruta de un fichero solo la sabe el preload.** Desde Electron 32 `File.path`
no existe: se obtiene con `webUtils.getPathForFile(file)`, expuesto como
`window.api.dnd.pathForFile`. Solo devuelve algo para un fichero que el usuario
ha arrastrado de verdad.

**Qué se hace con cada cosa** (`tabs/droppedItems.ts`, con tests):

- **Enlaces** (`text/uri-list`): una pestaña por URL. Solo `http:`, `https:`,
  `file:`, `vela:` y `about:` — `javascript:`, `data:` y `blob:` se descartan:
  soltar algo no puede ejecutar código.
- **Ficheros**: los que Chromium pinta (pdf, imágenes, texto, audio y vídeo) se
  abren como `file://`; el resto los abre el sistema operativo con
  `shell.openPath`, que es lo que hace cualquier navegador con un `.docx`.
- **Texto suelto**: si parece una URL se navega y, si no, se busca con el motor
  del perfil. Un dominio sin esquema (`example.com`) se completa, pero una frase
  con espacios no: no queremos convertir cualquier selección en una navegación.
- El texto solo se mira si no vino ni fichero ni enlace: al arrastrar un enlace,
  el navegador de origen manda los dos formatos y se abriría dos veces.

**Varios a la vez**: una pestaña por elemento, solo la primera se activa, y a
partir de 15 se pregunta — el mismo umbral y el mismo `confirm` que ya usa
«restaurar sesión» en el historial.

**Coste**: el resaltado se enciende en `dragenter` y se apaga en `dragleave`
(con contador, porque esos eventos rebotan entre los hijos); `dragover` solo
hace `preventDefault()`. Tocar el estado de React en `dragover` repintaría la
shell decenas de veces por segundo mientras se arrastra.

## Consecuencias

- Soltar sobre el área web sigue haciendo lo que diga la página. Si algún día se
  quiere cubrir, hay que hacerlo desde el preload de la pestaña y decidir qué
  pasa con los sitios que ya usan drops.
- `ExternalDropZone` envuelve con `display: contents` para no tocar el layout de
  lo que envuelve; el aviso de «suelta aquí» va fijo arriba a la izquierda,
  sobre la sidebar, porque cualquier cosa que cayera sobre el área del WCV no se
  vería.
- La lista de extensiones «que se pueden ver» es una aproximación a lo que
  Chromium pinta. Si algún formato queda mal clasificado, es una línea.
- Falta probarlo arrastrando de verdad: la parte de clasificación tiene tests,
  pero el gesto necesita un ratón (anotado en `docs/pending.md`).

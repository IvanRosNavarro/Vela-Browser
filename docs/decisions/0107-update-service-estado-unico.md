# ADR 0107 — UpdateService: un solo estado y salida para macOS

- Estado: aceptado
- Fecha: 2026-09-18
- Versión: v0.2.5

## Contexto

El actualizador de Vela Browser emitía ocho eventos IPC distintos
(`state:update-checking`, `-available`, `-not-available`,
`-download-progress`, `-downloaded`, `-error`, `-dev-mode`, más el de abrir
la modal) y el renderer reconstruía el estado a partir de ellos en
`updateStore`. Consecuencias:

- Una ventana abierta a mitad de una descarga no sabía nada de ella: el
  estado solo existía como historial de eventos ya emitidos.
- No había forma de preguntar «¿en qué punto estás?»; el estado vivía
  repartido entre `electron-updater` y el store del renderer.
- El ajuste `updates:auto-check` estaba en la interfaz desde Ajustes →
  General, pero main nunca lo leía: desactivarlo no hacía nada.
- En macOS la instalación fallaba **en silencio**. Squirrel.Mac solo aplica
  actualizaciones sobre un binario firmado y notarizado, y Vela no lo está:
  el usuario pulsaba «Descargar e instalar», veía el progreso y al reiniciar
  seguía en la versión antigua.
- No había ni un test: el módulo hablaba directamente con el `autoUpdater`
  importado, imposible de ejercitar sin Electron.

Vela FTP resolvió lo mismo en su ADR 0007 con un `UpdateService` con el
`autoUpdater` inyectado. Traemos aquí esa arquitectura.

## Decisión

- **`UpdateService`** (`packages/main/src/updater/UpdateService.ts`) es la
  fuente de verdad. Mantiene un único `UpdateStatus`
  (`packages/shared/src/types/update.ts`) con las fases `unsupported | idle |
  checking | up-to-date | available | downloading | downloaded | error`, la
  versión actual, la nueva, el porcentaje, el error y `canInstall`.
- **Un solo evento push**: `state:update-status-changed` lleva el estado
  entero en cada cambio. Los siete eventos parciales desaparecen. Se añade
  `update:get-status` para que una ventana recién abierta se ponga al día
  (`hydrate` en `updateStore`).
- **El `autoUpdater` se inyecta por constructor** (interfaz `Updater`), así
  que el servicio se testea con un updater falso: 7 tests en
  `UpdateService.test.ts`, sin Electron. El logger también se inyecta (`log`),
  porque el del kit importa `electron` en el módulo.
- **macOS: `canInstall = false`** (`process.platform !== 'darwin'`).
  `download()` e `install()` no hacen nada y la interfaz ofrece
  «Abrir página de descarga», que abre la release en el navegador con
  `shell.openExternal`. Es la mejora más útil del cambio: antes fallaba sin
  decir nada. Cuando el binario se firme, basta con quitar la condición.
  `autoInstallOnAppQuit` sigue a `canInstall`.
- **Nunca descarga sola** (`autoDownload = false`, como antes): la descarga la
  pide el usuario. Lo ya descargado se instala al cerrar Vela o con
  «Reiniciar e instalar».
- **Comprobación automática** a los 10 s de arrancar y cada 4 h, y ahora sí
  **respeta `updates:auto-check`**: el ajuste global se lee en cada tick, así
  que desactivarlo surte efecto sin reiniciar. En desarrollo el estado es
  `unsupported` y no se consulta nada (antes se saltaba el arranque del
  updater por completo y la modal dependía de un evento `dev-mode` aparte).
- Las comprobaciones simultáneas se agrupan en una sola promesa, y comprobar
  con una descarga en curso o terminada no reinicia el estado.
- Los canales `update:*` pasan por `guardTrustedFrame`: solo la shell y las
  páginas `vela://` pueden pedir una actualización.
- La interfaz sigue siendo la `UpdateModal` de Vela Browser (overlay a
  pantalla completa con `useOverlay`, patrón A de CLAUDE.md), adaptada a leer
  el estado único. No se copia la interfaz de Vela FTP.

## Consecuencias

- El toast «Vela está al día» de las comprobaciones automáticas desaparece:
  se emitía cada 4 h sin que nadie lo hubiera pedido. La comprobación manual
  abre la modal y allí sí se ve el resultado.
- Quien tenga `updates:auto-check` desactivado dejará de comprobar de verdad;
  hasta ahora el ajuste era decorativo.
- Los eventos IPC parciales del actualizador ya no existen: cualquier consumo
  futuro escucha `state:update-status-changed` o llama a `update:get-status`.

# 0094 — Las notificaciones del SO son efímeras; el historial vive en Vela

Fecha: 2026-08-12
Estado: aceptado

## Contexto

Vela tiene su propio centro de notificaciones (`NotificationManager` +
panel del renderer) con el historial completo por perfil en
`notifications` de `profile.db`. Además, cuando ninguna ventana de Vela
tiene el foco, se muestra una toast nativa del SO.

En Windows, las toasts que el usuario no descarta se quedan en el Centro
de notificaciones bajo el AppUserModelID de la app (`com.vela.browser`) y
el sistema pinta el número de toasts pendientes como badge sobre el icono
de la barra de tareas. Ese badge se lee con facilidad como un contador de
ventanas abiertas: con dos ventanas y ocho notificaciones sin descartar,
el icono muestra un "8".

El problema es de duplicidad de historiales: el del SO no está bajo el
control del usuario dentro de Vela (marcar como leída en el panel no
retiraba la toast) y su contador contradice lo que muestra la propia UI.

## Decisión

La toast del SO es un **aviso efímero**, no un historial. El historial
canónico es el panel de notificaciones de Vela.

En consecuencia, `NotificationManager` guarda las toasts vivas en
`osToasts` (id de notificación → `Notification` de Electron) y las cierra:

- al enfocar cualquier ventana de Vela (`app.on('browser-window-focus')`);
- al marcar la notificación como leída o borrarla;
- al marcar todas como leídas o vaciar el panel (por perfil).

Las toasts que quedaron de ejecuciones anteriores (cierre abrupto,
notificaciones nunca descartadas) no son accesibles desde ese mapa, así
que al arrancar se vacía el historial de toasts de la app vía WinRT
(`ToastNotificationManager.History.Clear`) desde PowerShell, en
`packages/main/src/platform/windowsToastHistory.ts`. Es best-effort:
cualquier fallo se ignora en silencio.

## Consecuencias

- El badge numérico de la barra de tareas de Windows deja de aparecer.
- El usuario no encuentra notificaciones de Vela en el Centro de
  notificaciones del SO tras volver al navegador; están en el panel de
  Vela, que es donde puede gestionarlas.
- Se depende de PowerShell para la limpieza de arranque en Windows.
  Electron no expone la API de historial de toasts. Si PowerShell no está
  disponible, el único efecto es que un badge residual sobrevive hasta que
  el usuario vacíe el Centro de notificaciones a mano.
- En macOS y Linux la limpieza de arranque no se ejecuta; el cierre de
  toasts vivas sí, y es suficiente porque esas plataformas no derivan un
  badge de ellas.

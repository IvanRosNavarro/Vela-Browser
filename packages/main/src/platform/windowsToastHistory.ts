import { execFile } from 'node:child_process';

/**
 * Vacía el historial de toasts de Vela en el Centro de notificaciones de
 * Windows.
 *
 * Windows cuenta las toasts que siguen en el Centro de notificaciones bajo el
 * AppUserModelID de la app y pinta ese número como badge sobre el icono de la
 * barra de tareas — se lee fácilmente como un contador de ventanas y despista.
 * Vela ya guarda su propio historial en el panel de notificaciones, así que las
 * toasts del SO son efímeras por diseño: `NotificationManager` cierra las de la
 * sesión en curso y esta función limpia las que quedaron de ejecuciones
 * anteriores (cierres abruptos, notificaciones nunca descartadas).
 *
 * No hay API de Electron para esto; se hace vía WinRT desde PowerShell. Es
 * best-effort: cualquier fallo se ignora en silencio.
 */
export function clearWindowsToastHistory(appUserModelId: string): void {
  if (process.platform !== 'win32') return;

  const script =
    '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] > $null; ' +
    `[Windows.UI.Notifications.ToastNotificationManager]::History.Clear('${appUserModelId}')`;

  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script],
    { windowsHide: true, timeout: 5000 },
    () => {
      // Sin PowerShell, sin WinRT o sin historial: nada que hacer.
    },
  );
}

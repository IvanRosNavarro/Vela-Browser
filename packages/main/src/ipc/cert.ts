import { ipcMain, webContents } from 'electron';
import type { IpcContext } from './context';
import { certEvents } from '../security/certEvents';

export function registerCertHandlers(ctx: IpcContext): void {
  // Acción "Continuar de todas formas": el protocolo vela://cert-proceed emite este
  // evento tras verificar los parámetros. Aquí añadimos la huella a la lista de
  // aceptados y recargamos la URL original.
  certEvents.on('proceed', ({ fingerprint, url, wcId }) => {
    // Solo continúa si la huella coincide con el error mostrado en ese WC y el
    // origen casa; devuelve la URL original validada a la que navegar.
    const target = ctx.certManager.allowForWebContents(wcId, fingerprint, url);
    if (!target) return;
    const wc = webContents.fromId(wcId);
    if (wc && !wc.isDestroyed()) {
      setImmediate(() => { void wc.loadURL(target).catch(() => { /* navegación abortada */ }); });
    }
  });

  // Acción "Volver a lugar seguro": go back si hay historial, si no cierra la tab.
  certEvents.on('back', ({ wcId }) => {
    const wc = webContents.fromId(wcId);
    if (!wc || wc.isDestroyed()) return;

    if (wc.navigationHistory.canGoBack()) {
      wc.navigationHistory.goBack();
      return;
    }

    const tabId = ctx.tabManager.getTabIdForWebContents(wcId);
    if (tabId) {
      const windowId = ctx.tabManager.getWindowIdForTab(tabId);
      if (windowId != null) {
        void ctx.tabManager.closeTab(windowId, tabId);
        return;
      }
    }

    // Fallback: no encontramos la tab, navegar a newtab
    void wc.loadURL('vela://newtab').catch(() => { /* navegación abortada */ });
  });

  // Canal IPC heredado (sólo accesible desde el preload compilado con velaCert).
  // Mantenerlo como alias por compatibilidad.
  ipcMain.handle('cert:allow', (event, rawArgs) => {
    const senderUrl = event.sender.getURL();
    if (!senderUrl.startsWith('vela://cert-error')) return;
    const args = rawArgs as { fingerprint?: unknown; url?: unknown };
    if (typeof args?.fingerprint !== 'string' || typeof args?.url !== 'string') return;
    const target = ctx.certManager.allowForWebContents(
      event.sender.id,
      args.fingerprint,
      args.url,
    );
    if (!target) return;
    void event.sender.loadURL(target).catch(() => { /* navegación abortada */ });
  });

  ipcMain.handle('cert:go-back', (event) => {
    const senderUrl = event.sender.getURL();
    if (!senderUrl.startsWith('vela://cert-error')) return;
    const wc = event.sender;
    if (wc.navigationHistory.canGoBack()) {
      wc.navigationHistory.goBack();
    } else {
      void wc.loadURL('vela://newtab').catch(() => { /* navegación abortada */ });
    }
  });
}

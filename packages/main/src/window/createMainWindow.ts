import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { release } from 'node:os';
import { platform } from 'node:process';
import { app, BrowserWindow } from 'electron';
import { getAppIconPath } from './iconPath';
import { buildCspHeader } from '../security/csp';

const PRELOAD_PATH = path.join(__dirname, '..', '..', 'preload', 'dist', 'index.js');

// En Windows, el material nativo (acrylic) requiere build >= 22621 (Win 11 22H2).
function isAcrylicSupported(): boolean {
  if (platform !== 'win32') return false;
  const parts = release().split('.');
  const build = parseInt(parts[2] ?? '0', 10);
  return build >= 22621;
}

export const backgroundMaterialSupported: { value: boolean } = { value: false };

const titleBarConfig = (() => {
  if (platform === 'darwin') {
    return { titleBarStyle: 'hiddenInset' as const };
  }
  if (platform === 'win32') {
    return {
      titleBarStyle: 'hidden' as const,
      titleBarOverlay: {
        color: '#1a1a1a',
        symbolColor: '#e0e0e0',
        height: 32,
      },
    };
  }
  return { titleBarStyle: 'hidden' as const };
})();

export interface WindowInitState {
  sidebarWidth?: number;
  isBlinded?: boolean;
}

export function createMainWindow(initState?: WindowInitState): BrowserWindow {
  const useAcrylic = isAcrylicSupported();

  const velaInit = {
    sidebarWidth: initState?.sidebarWidth ?? 240,
    isBlindedWindow: initState?.isBlinded ?? false,
  };
  const additionalArguments = [`--vela-init=${JSON.stringify(velaInit)}`];

  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 500,
    show: false,
    icon: getAppIconPath(),
    // Fondo transparente en Windows para que acrylic funcione.
    // En macOS/Linux mantenemos color sólido para evitar flash al cargar.
    backgroundColor: platform === 'win32' ? '#00000000' : '#0a0a0a',
    autoHideMenuBar: true,
    ...(platform === 'darwin' ? { vibrancy: 'sidebar' as const } : {}),
    ...titleBarConfig,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      additionalArguments,
    },
  });

  if (useAcrylic) {
    try {
      // setBackgroundMaterial disponible en Electron 30+ / Windows 11 22H2+
      (window as unknown as { setBackgroundMaterial(m: string): void })
        .setBackgroundMaterial('acrylic');
      backgroundMaterialSupported.value = true;
    } catch {
      backgroundMaterialSupported.value = false;
    }
  }

  const isDev = !app.isPackaged;
  const cspHeader = buildCspHeader(isDev);

  // Prefijo file:// del paquete de la app (dentro del ASAR en producción, repo en dev).
  // Se usa para acotar la CSP solo a los recursos del bundle, excluyendo archivos
  // en userData (p.ej. vela-ctxmenu.html) que tienen scripts inline y no son externos.
  const appFilePrefix = pathToFileURL(app.getAppPath()).href + '/';

  // Aplica CSP y cabeceras de seguridad a todos los recursos que carga la shell.
  // Los WCV de las pestañas usan sesiones particionadas distintas y no se ven afectados.
  window.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const isVelaResource =
      details.url.startsWith('vela://') ||
      details.url.startsWith(appFilePrefix) ||
      (isDev && details.url.startsWith('http://localhost'));

    if (!isVelaResource) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspHeader],
        'X-Content-Type-Options': ['nosniff'],
        'Referrer-Policy': ['no-referrer'],
      },
    });
  });

  // Las páginas internas de Vela no necesitan ningún permiso del usuario.
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  window.once('ready-to-show', () => {
    window.show();
  });

  return window;
}

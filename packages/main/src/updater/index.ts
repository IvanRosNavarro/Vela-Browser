import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IPC_EVENTS } from '@vela/shared';
import { logger } from '../logger';

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let initialized = false;
let intervalHandle: NodeJS.Timeout | null = null;

function broadcastToAllWindows(channel: string, payload?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

export function initUpdater(): void {
  if (initialized) return;

  if (!app.isPackaged) {
    logger.info('[updater] dev: omitido (no aplicable a builds no empaquetadas)');
    return;
  }

  initialized = true;

  autoUpdater.logger = {
    info: (msg) => logger.info(`[updater] ${stringifyEvent(msg)}`),
    warn: (msg) => logger.warn(`[updater] ${stringifyEvent(msg)}`),
    error: (msg) => logger.error(`[updater] ${stringifyEvent(msg)}`),
    debug: (msg) => logger.debug(`[updater] ${stringifyEvent(msg)}`),
  };

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    logger.info('[updater] comprobando actualizaciones…');
    broadcastToAllWindows(IPC_EVENTS.UPDATE_CHECKING);
  });

  autoUpdater.on('update-available', (info) => {
    logger.info(`[updater] disponible: v${info.version}`);
    broadcastToAllWindows(IPC_EVENTS.UPDATE_AVAILABLE, { version: info.version });
  });

  autoUpdater.on('update-not-available', (info) => {
    logger.debug(`[updater] al día (versión actual ${info.version})`);
    broadcastToAllWindows(IPC_EVENTS.UPDATE_NOT_AVAILABLE, { version: info.version });
  });

  autoUpdater.on('download-progress', (p) => {
    logger.debug(
      `[updater] descargando ${p.percent.toFixed(1)}% (${(p.bytesPerSecond / 1024).toFixed(0)} KB/s)`,
    );
    broadcastToAllWindows(IPC_EVENTS.UPDATE_DOWNLOAD_PROGRESS, {
      percent: Math.round(p.percent),
      bytesPerSecond: p.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    logger.info(`[updater] descargada v${info.version}; se aplicará al cerrar la app`);
    broadcastToAllWindows(IPC_EVENTS.UPDATE_DOWNLOADED, { version: info.version });
  });

  autoUpdater.on('error', (err) => {
    logger.error(`[updater] error: ${err.message}`);
    broadcastToAllWindows(IPC_EVENTS.UPDATE_ERROR, { message: err.message });
  });

  void autoUpdater.checkForUpdates().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[updater] check inicial fallido: ${message}`);
  });

  intervalHandle = setInterval(() => {
    void autoUpdater.checkForUpdates().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`[updater] check periódico fallido: ${message}`);
    });
  }, CHECK_INTERVAL_MS);
}

export async function checkForUpdatesNow(): Promise<void> {
  await autoUpdater.checkForUpdates().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[updater] checkForUpdatesNow fallido: ${message}`);
    throw err;
  });
}

export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate();
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall();
}

export function shutdownUpdater(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

function stringifyEvent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

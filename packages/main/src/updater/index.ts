import { app, shell, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IPC_EVENTS, type UpdateStatus } from '@vela/shared';
import { logger } from '../logger';
import { UpdateService, type Updater } from './UpdateService';

export { UpdateService } from './UpdateService';
export type { Updater, UpdateServiceOptions } from './UpdateService';

const RELEASES_URL = 'https://github.com/IvanRosNavarro/Vela-Browser/releases';

/**
 * macOS: Squirrel.Mac solo aplica actualizaciones sobre un binario firmado y
 * notarizado, y Vela no lo está todavía. Sin esto la actualización fallaba en
 * silencio; ahora la interfaz ofrece abrir la página de la release.
 */
const CAN_INSTALL = process.platform !== 'darwin';

let service: UpdateService | null = null;

function broadcast(status: UpdateStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC_EVENTS.UPDATE_STATUS_CHANGED, status);
  }
}

export interface InitUpdaterOptions {
  /** Lee el ajuste global `updates:auto-check` en cada tick. */
  autoCheckEnabled: () => boolean;
}

export function initUpdater(options: InitUpdaterOptions): UpdateService {
  if (service) return service;

  const packaged = app.isPackaged;

  if (packaged) {
    autoUpdater.logger = {
      info: (msg) => logger.info(`[updater] ${stringifyEvent(msg)}`),
      warn: (msg) => logger.warn(`[updater] ${stringifyEvent(msg)}`),
      error: (msg) => logger.error(`[updater] ${stringifyEvent(msg)}`),
      debug: (msg) => logger.debug(`[updater] ${stringifyEvent(msg)}`),
    };
  } else {
    logger.info('[updater] dev: sin feed de actualizaciones (estado "unsupported")');
  }

  service = new UpdateService({
    updater: autoUpdater as unknown as Updater,
    currentVersion: app.getVersion(),
    packaged,
    canInstall: CAN_INSTALL,
    autoCheckEnabled: options.autoCheckEnabled,
    onChange: broadcast,
    openExternal: (url) => {
      void shell.openExternal(url).catch((err: unknown) => {
        logger.warn(`[updater] no se pudo abrir ${url}: ${stringifyEvent(err)}`);
      });
    },
    releasesUrl: RELEASES_URL,
    log: (message) => logger.warn(`[updater] ${message}`),
  });
  service.startAutoCheck();
  return service;
}

/** `null` hasta que `initUpdater` corre (arranque de la app). */
export function getUpdateService(): UpdateService | null {
  return service;
}

export function shutdownUpdater(): void {
  service?.stop();
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

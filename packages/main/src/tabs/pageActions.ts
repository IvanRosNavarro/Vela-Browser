import path from 'node:path';
import { app, dialog, type BrowserWindow, type WebContents } from 'electron';
import { IPC_EVENTS } from '@vela/shared';
import { logger } from '../logger';
import type { MainEventBus } from '../ipc/events';
import {
  SAVE_PAGE_FILTERS,
  defaultSavePageName,
  savePageFormatForPath,
} from './pageSaveFormat';

/**
 * Acciones sobre la página de una pestaña que comparten el comando del
 * registro central (Ctrl+P / Ctrl+S), el menú contextual web y el menú de
 * Vela. Un único punto para que las tres vías se comporten igual.
 */

function usable(wc: WebContents | null): wc is WebContents {
  return wc !== null && !wc.isDestroyed();
}

function toastError(events: MainEventBus, windowId: number, message: string): void {
  events.emit(IPC_EVENTS.COMMAND_RENDERER_ACTION, {
    windowId,
    action: 'show-toast',
    payload: { message, type: 'error' },
  });
}

/** Abre el diálogo de impresión de Chromium para la página. */
export function printPage(wc: WebContents | null): void {
  if (!usable(wc)) return;
  wc.print({}, (success, failureReason) => {
    // 'cancelled' es el usuario cerrando el diálogo: no es un error.
    if (!success && failureReason && failureReason !== 'cancelled') {
      logger.warn(`[page] print falló: ${failureReason}`);
    }
  });
}

/**
 * «Guardar página como…»: diálogo nativo con los tres formatos de Chromium y
 * `webContents.savePage`. Al terminar avisa a la ventana con `PAGE_SAVED`
 * (toast con acceso a la carpeta) o con un toast de error.
 */
export async function savePageAs(
  wc: WebContents | null,
  parentWin: BrowserWindow | null,
  events: MainEventBus,
): Promise<void> {
  if (!usable(wc)) return;
  const win = parentWin && !parentWin.isDestroyed() ? parentWin : null;

  const defaultName = defaultSavePageName(wc.getTitle() || null, wc.getURL() || null);
  const options: Electron.SaveDialogOptions = {
    title: 'Guardar página como',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: SAVE_PAGE_FILTERS.map((f) => ({ name: f.name, extensions: [...f.extensions] })),
  };
  const { filePath, canceled } = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);
  if (canceled || !filePath || wc.isDestroyed()) return;

  const format = savePageFormatForPath(filePath);
  try {
    await wc.savePage(filePath, format);
  } catch (err) {
    logger.warn(`[page] savePage(${format}) falló`, err);
    if (win && !win.isDestroyed()) {
      toastError(events, win.id, 'No se pudo guardar la página');
    }
    return;
  }
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC_EVENTS.PAGE_SAVED, { filePath });
  }
}

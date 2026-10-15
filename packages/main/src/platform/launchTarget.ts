import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { isViewableFile } from '../tabs/droppedItems';

/**
 * Traduce un argumento con el que el SO lanza Vela a la URL que hay que abrir.
 *
 * Llegan dos clases de cosas por el mismo `"%1"`:
 * - una URL, cuando Vela es el navegador predeterminado y se hace clic en un
 *   enlace desde otra aplicación;
 * - la ruta de un fichero, cuando se abre un `.pdf`, `.html`… asociado a Vela.
 *
 * Las rutas no pasan por `new URL`: `C:\docs\x.pdf` se parsea sin error como
 * una URL de esquema `c:`. Solo se aceptan rutas absolutas de ficheros que
 * existen y que Chromium sabe pintar; así no se abre por error el script de
 * entrada que lleva el argv en desarrollo ni cualquier otra cosa suelta.
 */
export function resolveLaunchTarget(arg: string): string | null {
  if (!arg || arg.startsWith('-')) return null;

  if (path.isAbsolute(arg) || path.win32.isAbsolute(arg)) {
    return fileTarget(arg);
  }

  try {
    const url = new URL(arg);
    if (url.protocol === 'http:' || url.protocol === 'https:') return arg;
    if (url.protocol === 'file:') return isViewableFile(url.pathname) ? url.toString() : null;
  } catch {
    // ni URL ni ruta absoluta (p.ej. el `.` con el que se arranca en desarrollo)
  }
  return null;
}

function fileTarget(filePath: string): string | null {
  if (!isViewableFile(filePath)) return null;
  try {
    if (!fs.statSync(filePath).isFile()) return null;
  } catch {
    return null;
  }
  return pathToFileURL(filePath).toString();
}

/** Primer argumento de `argv` (saltando el ejecutable) que se pueda abrir. */
export function findLaunchTarget(argv: readonly string[]): string | null {
  for (const arg of argv.slice(1)) {
    const target = resolveLaunchTarget(arg);
    if (target) return target;
  }
  return null;
}

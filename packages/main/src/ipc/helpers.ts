import { BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import { InvariantViolationError } from '../lib/errors';
import type { ProfileRepositories } from '../profiles/ProfileManager';
import type { IpcContext } from './context';
import { guardTrustedFrame } from './validate';

/**
 * Resuelve la BrowserWindow desde la que llega el invoke. Devuelve null si
 * el sender es un WebContents huérfano (caso raro: e.g. extension service
 * worker invocando un canal que no debería). Cada handler decide qué hacer
 * con null; lo habitual es traducirlo a InvariantViolationError.
 */
export function resolveWindowId(event: IpcMainInvokeEvent): number | null {
  // BrowserWindow.fromWebContents works for the shell's own webContents.
  // For WebContentsView (vela:// internal pages), we fall back to
  // getOwnerBrowserWindow() which traverses the view hierarchy.
  const win =
    BrowserWindow.fromWebContents(event.sender) ??
    (event.sender as typeof event.sender & { getOwnerBrowserWindow?(): BrowserWindow | null }).getOwnerBrowserWindow?.() ??
    null;
  if (!win) return null;
  // Child BrowserWindows (floating sidebar, popups) deben enrutar al padre,
  // que es quien tiene el TabManager y el contexto de negocio.
  return (win.getParentWindow() ?? win).id;
}

/**
 * Devuelve los repositorios per-perfil correspondientes a la ventana desde
 * la que llega `event`. Patrón estándar para handlers IPC que tras Fase 3
 * ya no pueden usar un singleton: el dato vive en profile.db, y profile.db
 * es la del perfil al que pertenece la ventana del frame remitente.
 *
 * Los casos de error son verdaderos invariant breaks: si llegamos aquí sin
 * window asociada, sin profileId mapeado o con el perfil cerrado, algo se
 * ha desincronizado entre ProfileWindowManager y ProfileManager. El handler
 * IPC convertirá la excepción en `IpcResponse` vía `mapError`.
 */
export function getReposForFrame(
  event: IpcMainInvokeEvent,
  ctx: IpcContext,
): ProfileRepositories {
  guardTrustedFrame(event, 'getReposForFrame');
  const windowId = resolveWindowId(event);
  if (windowId === null) {
    throw new InvariantViolationError(
      'getReposForFrame: webContents sin BrowserWindow asociada',
    );
  }
  const profileId = ctx.profileWindowManager.getProfileForWindow(windowId);
  if (!profileId) {
    throw new InvariantViolationError(
      `getReposForFrame: window ${windowId} sin perfil asignado`,
    );
  }
  return ctx.profileManager.getRepositories(profileId);
}

/**
 * Variante que además devuelve el windowId/profileId resueltos. Útil en
 * handlers que ya los iban a leer (workspace:set-active emite eventos con
 * windowId, etc.) para evitar resolverlos dos veces.
 */
export function getFrameContext(
  event: IpcMainInvokeEvent,
  ctx: IpcContext,
): {
  windowId: number;
  profileId: string;
  repos: ProfileRepositories;
} {
  guardTrustedFrame(event, 'getFrameContext');
  const windowId = resolveWindowId(event);
  if (windowId === null) {
    throw new InvariantViolationError(
      'getFrameContext: webContents sin BrowserWindow asociada',
    );
  }
  const profileId = ctx.profileWindowManager.getProfileForWindow(windowId);
  if (!profileId) {
    throw new InvariantViolationError(
      `getFrameContext: window ${windowId} sin perfil asignado`,
    );
  }
  const repos = ctx.profileManager.getRepositories(profileId);
  return { windowId, profileId, repos };
}

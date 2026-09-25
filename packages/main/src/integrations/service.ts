import { app, safeStorage, BrowserWindow } from 'electron';
import { logger } from '../logger';
import type { MainEventBus } from '../ipc/events';
import type { NotificationManager } from '../notifications/NotificationManager';
import type { ProfileManager } from '../profiles/ProfileManager';
import type { ProfileWindowManager } from '../profiles/ProfileWindowManager';
import type { TabManager } from '../tabs/TabManager';
import { IntegrationsService } from './IntegrationsService';
import { TokenStore } from './TokenStore';

let service: IntegrationsService | null = null;

/**
 * Última ventana que tuvo el foco en cada perfil. Es la que el usuario
 * considera "su" ventana: abrir la pull request en otra cualquiera del perfil
 * la haría aparecer donde no está mirando.
 */
const lastFocusedByProfile = new Map<string, number>();

export interface InitIntegrationsOptions {
  profileManager: ProfileManager;
  profileWindowManager: ProfileWindowManager;
  notificationManager: NotificationManager;
  tabManager: TabManager;
  events: MainEventBus;
}

export function initIntegrations(opts: InitIntegrationsOptions): IntegrationsService {
  if (service) return service;

  app.on('browser-window-focus', (_event, win) => {
    const profileId = opts.profileWindowManager.getProfileForWindow(win.id);
    // Solo las ventanas principales: un popup no tiene workspace donde abrir.
    if (profileId && opts.tabManager.getWorkspaceForWindow(win.id) !== null) {
      lastFocusedByProfile.set(profileId, win.id);
    }
  });

  service = new IntegrationsService({
    profileManager: opts.profileManager,
    notificationManager: opts.notificationManager,
    events: opts.events,
    logger,
    tokenStore: new TokenStore({
      isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
      encryptString: (s) => safeStorage.encryptString(s),
      decryptString: (b) => safeStorage.decryptString(b),
    }),
    openUrl: (profileId, url) => {
      void openInProfile(opts, profileId, url).catch((err: unknown) => {
        logger.warn('[integrations] no se pudo abrir la pull request', err);
      });
    },
  });
  service.start();
  return service;
}

/**
 * Abre la pull request donde el usuario la espera: la última ventana del perfil
 * que tuvo el foco. Si el perfil se quedó sin ventanas (se cerraron todas pero
 * el aviso seguía vivo), se abre una nueva antes que no hacer nada.
 */
async function openInProfile(
  opts: InitIntegrationsOptions,
  profileId: string,
  url: string,
): Promise<void> {
  const windowId = resolveTargetWindow(opts, profileId);

  if (windowId === null) {
    logger.info(`[integrations] sin ventana viva en profile=${profileId}: se abre una`);
    const win = await opts.profileWindowManager.openWindow(profileId);
    const workspaceId = opts.tabManager.getWorkspaceForWindow(win.id);
    if (!workspaceId) {
      logger.warn('[integrations] la ventana nueva no tiene workspace activo');
      return;
    }
    await opts.tabManager.createTab(win.id, {
      workspaceId,
      parentId: null,
      url,
      activate: true,
    });
    return;
  }

  const workspaceId = opts.tabManager.getWorkspaceForWindow(windowId);
  if (!workspaceId) {
    logger.warn(`[integrations] window ${windowId} sin workspace activo`);
    return;
  }

  const win = BrowserWindow.fromId(windowId);
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }

  await opts.tabManager.createTab(windowId, {
    workspaceId,
    parentId: null,
    url,
    activate: true,
  });
}

function resolveTargetWindow(
  opts: InitIntegrationsOptions,
  profileId: string,
): number | null {
  const alive = (id: number): boolean => {
    const win = BrowserWindow.fromId(id);
    return win !== null && !win.isDestroyed();
  };

  // 1) La ventana enfocada ahora mismo, si es de este perfil.
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && opts.profileWindowManager.getProfileForWindow(focused.id) === profileId) {
    if (opts.tabManager.getWorkspaceForWindow(focused.id) !== null) return focused.id;
  }

  // 2) La última que tuvo el foco en este perfil.
  const remembered = lastFocusedByProfile.get(profileId);
  if (remembered !== undefined && alive(remembered)) return remembered;
  if (remembered !== undefined) lastFocusedByProfile.delete(profileId);

  // 3) Cualquiera del perfil que tenga workspace.
  for (const id of opts.profileWindowManager.getWindowsForProfile(profileId)) {
    if (alive(id) && opts.tabManager.getWorkspaceForWindow(id) !== null) return id;
  }

  return null;
}

/**
 * Nunca es `null` en tiempo de ejecución: `initIntegrations` corre al construir
 * el contexto IPC, antes de que ninguna ventana pueda invocar un canal.
 */
export function getIntegrationsService(): IntegrationsService {
  if (!service) {
    throw new Error('IntegrationsService no inicializado');
  }
  return service;
}

export function shutdownIntegrations(): void {
  service?.stop();
  service = null;
  lastFocusedByProfile.clear();
}

import { safeStorage, BrowserWindow } from 'electron';
import { logger } from '../logger';
import type { MainEventBus } from '../ipc/events';
import type { NotificationManager } from '../notifications/NotificationManager';
import type { ProfileManager } from '../profiles/ProfileManager';
import type { ProfileWindowManager } from '../profiles/ProfileWindowManager';
import type { TabManager } from '../tabs/TabManager';
import { IntegrationsService } from './IntegrationsService';
import { TokenStore } from './TokenStore';

let service: IntegrationsService | null = null;

export interface InitIntegrationsOptions {
  profileManager: ProfileManager;
  profileWindowManager: ProfileWindowManager;
  notificationManager: NotificationManager;
  tabManager: TabManager;
  events: MainEventBus;
}

export function initIntegrations(opts: InitIntegrationsOptions): IntegrationsService {
  if (service) return service;

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
      // El aviso puede llegar con la ventana en segundo plano o minimizada:
      // se abre en la primera ventana viva del perfil que lo generó.
      const windowId = opts.profileWindowManager
        .getWindowsForProfile(profileId)
        .find((id) => {
          const win = BrowserWindow.fromId(id);
          return win !== null && !win.isDestroyed();
        });
      if (windowId === undefined) return;

      const workspaceId = opts.tabManager.getWorkspaceForWindow(windowId);
      if (!workspaceId) return;

      void opts.tabManager
        .createTab(windowId, { workspaceId, parentId: null, url, activate: true })
        .catch((err: unknown) => {
          logger.warn('[integrations] no se pudo abrir la pull request', err);
        });
    },
  });
  service.start();
  return service;
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
}

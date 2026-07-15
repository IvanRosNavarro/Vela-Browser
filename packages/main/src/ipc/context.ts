import type {
  AppMetadataRepository,
  ProfileRepository,
} from '../storage/repositories';
import type { WindowStateRepository } from '../storage/repositories/WindowStateRepository';
import type { ProfileManager } from '../profiles/ProfileManager';
import type { ProfileKeyring } from '../profiles/ProfileKeyring';
import type { ProfileWindowManager } from '../profiles/ProfileWindowManager';
import type { UnlockRateLimiter } from '../profiles/UnlockRateLimiter';
import type { ProfileExtensionManager } from '../extensions/ProfileExtensionManager';
import type { TabManager } from '../tabs/TabManager';
import type { MainEventBus } from './events';
import type { LayoutManager } from '../layout/LayoutManager';
import type { GlanceManager } from '../glance/GlanceManager';
import type { MediaSessionManager } from '../media/MediaSessionManager';
import type { MediaPopupWindow } from '../media/MediaPopupWindow';
import type { AdBlockerManager } from '../adblocker/AdBlockerManager';
import type { SyncManager } from '../sync/SyncManager';
import type { DownloadManager } from '../downloads/DownloadManager';
import type { Logger } from '../logger';
import type { NotificationManager } from '../notifications/NotificationManager';
import type { PushSubscriptionManager } from '../notifications/PushSubscriptionManager';
import type { PushProxyManager } from '../notifications/PushProxyManager';
import type { CertificateManager } from '../security/CertificateManager';
import type { ClientCertificateManager } from '../security/ClientCertificateManager';
import type { MediaPermissionManager } from '../media-permissions/MediaPermissionManager';

/**
 * Contexto compartido por todos los handlers IPC. Tras Fase 3 Prompt 6 los
 * repositorios per-profile (workspaces, tree_nodes, auto_group_rules,
 * settings_profile, profile_metadata) NO viven aquí: cada handler los pide
 * vía `getReposForFrame(event, ctx)` para obtener la instancia ligada al
 * perfil de la ventana del frame remitente.
 *
 * Solo permanecen como singletons las cosas globales de la app:
 *   - profiles (vela.db `profiles`): catálogo global de perfiles.
 *   - appMetadata (vela.db `app_metadata`): KV global (last-active-profile,
 *     app_version, atajos custom — Fase 4).
 */
export interface IpcContext {
  repositories: {
    profiles: ProfileRepository;
    appMetadata: AppMetadataRepository;
    windowState: WindowStateRepository;
  };
  events: MainEventBus;
  tabManager: TabManager;
  layoutManager: LayoutManager;
  glanceManager: GlanceManager;
  mediaManager: MediaSessionManager;
  mediaPopupWindow: MediaPopupWindow;
  logger: Logger;
  profileManager: ProfileManager;
  profileWindowManager: ProfileWindowManager;
  unlockRateLimiter: UnlockRateLimiter;
  keyring: ProfileKeyring;
  extensionManager: ProfileExtensionManager;
  adBlockerManager: AdBlockerManager;
  downloadManager: DownloadManager;
  notificationManager: NotificationManager;
  pushSubscriptionManager: PushSubscriptionManager;
  pushProxyManager: PushProxyManager;
  mediaPermissionManager: MediaPermissionManager;
  /** Un SyncManager por profileId (creado bajo demanda en sync:setup). */
  syncManagers: Map<string, SyncManager>;
  certManager: CertificateManager;
  clientCertManager: ClientCertificateManager;
}

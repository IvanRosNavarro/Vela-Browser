import { session, type Session } from 'electron';
import { logger } from '../logger';
import type { NotificationManager } from '../notifications/NotificationManager';

const DEFAULT_DENY_PERMISSIONS = new Set<string>([
  'clipboard-read',
  'clipboard-sanitized-write',
  'display-capture',
  'fullscreen',
  'geolocation',
  'idle-detection',
  'media',
  'mediaKeySystem',
  'midi',
  'midiSysex',
  'pointerLock',
  'keyboardLock',
  'openExternal',
  'speaker-selection',
  'storage-access',
  'top-level-storage-access',
  'window-management',
  'unknown',
  'fileSystem',
  'serial',
  'usb',
  'hid',
  'bluetooth',
]);

export function getSessionForProfile(partitionId: string): Session {
  return session.fromPartition(partitionId);
}

function safeOrigin(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.origin || u.origin === 'null') return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Aplica defaults de privacidad/seguridad a la sesión del perfil.
 * Cuando se proporciona un NotificationManager, las notificaciones y push
 * se deniegan a Chromium para que Vela los gestione en su propio centro.
 * Sin el manager (compatibilidad), se conceden automáticamente.
 */
export async function configureSessionDefaults(
  s: Session,
  profileId: string,
  notificationManager?: NotificationManager,
): Promise<void> {
  s.setPermissionCheckHandler((wc, permission) => {
    const p = permission as string;
    if (p === 'periodicBackgroundSync') return true;
    if (p === 'notifications' || p === 'push') {
      if (!notificationManager || !wc) return true;
      const origin = safeOrigin(wc.getURL());
      if (!origin) return false;
      // Solo bloquear si el usuario denegó explícitamente.
      // Orígenes desconocidos devuelven true para que la página vea
      // Notification.permission = "granted" y llame a requestPermission()
      // o pushManager.subscribe(), lo que activa nuestro requestHandler.
      return !notificationManager.isDenied(origin, profileId);
    }
    return false;
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ses = s as any;

  s.setPermissionRequestHandler((wc, permission, callback) => {
    const p = permission as string;
    if (p === 'periodicBackgroundSync') {
      callback(true);
      return;
    }
    if (p === 'notifications') {
      if (!notificationManager) { callback(false); return; }
      const origin = safeOrigin(wc.getURL());
      if (!origin) { callback(false); return; }
      // Respuesta inmediata si ya hay decisión almacenada
      if (notificationManager.isGranted(origin, profileId)) { callback(true); return; }
      if (notificationManager.isDenied(origin, profileId)) { callback(false); return; }
      // Sin decisión → guardar callback y mostrar la campana en estado 'pending'
      notificationManager.registerPendingRequest(wc.id, origin, {
        hasPushRequest: false,
        callback,
      });
      return;
    }
    if (p === 'push') {
      if (!notificationManager) { callback(false); return; }
      const origin = safeOrigin(wc.getURL());
      if (!origin) { callback(false); return; }
      // Si ya tiene notificaciones concedidas → conceder push automáticamente
      if (notificationManager.isGranted(origin, profileId)) {
        callback(true);
        ses.setPermissionOverridesForOrigin?.(origin, { notifications: 'granted' });
        void notificationManager.captureAndStorePushSubscription(wc, origin, profileId);
        return;
      }
      if (notificationManager.isDenied(origin, profileId)) { callback(false); return; }
      // Sin decisión → guardar callback con flag push
      notificationManager.registerPendingRequest(wc.id, origin, {
        hasPushRequest: true,
        callback,
      });
      return;
    }
    if (DEFAULT_DENY_PERMISSIONS.has(permission)) {
      callback(false);
      return;
    }
    logger.warn(`[session ${profileId}] permiso no listado denegado: ${permission}`);
    callback(false);
  });

  try {
    s.setSpellCheckerEnabled(false);
  } catch (err) {
    logger.warn(`[session ${profileId}] setSpellCheckerEnabled falló`, err);
  }
}

/**
 * Restaura los overrides de permiso de notificaciones al arrancar el perfil.
 * Sin esto los sitios con permiso concedido vuelven a pedirlo en cada arranque.
 */
export async function restoreNotificationOverrides(
  s: Session,
  profileId: string,
  notificationManager: NotificationManager,
): Promise<void> {
  const grantedOrigins = notificationManager.getGrantedOrigins(profileId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ses = s as any;
  for (const origin of grantedOrigins) {
    ses.setPermissionOverridesForOrigin?.(origin, { notifications: 'granted' });
  }
}

/**
 * Borra todo el storage persistente de la sesión del perfil.
 */
export async function clearSessionData(partitionId: string): Promise<void> {
  const s = session.fromPartition(partitionId);
  await s.clearStorageData({
    storages: [
      'cookies',
      'localstorage',
      'indexdb',
      'serviceworkers',
      'cachestorage',
      'websql',
      'shadercache',
    ],
  });
  await s.clearCache();
  await s.clearAuthCache();
  await s.clearHostResolverCache();
}

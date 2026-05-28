import type { Session, WebContents } from 'electron';
import type { Logger } from '../logger';
import type { ProfileManager } from '../profiles/ProfileManager';
import type { PushSubscription } from '../storage/repositories/PushSubscriptionRepository';

export type { PushSubscription };

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushSubscriptionManagerCtx {
  profileManager: ProfileManager;
  logger: Logger;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PushSubscriptionManager {
  constructor(private readonly ctx: PushSubscriptionManagerCtx) {}

  subscribe(profileId: string, origin: string, input: PushSubscriptionInput): void {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      repos.pushSubscriptions.upsert({
        id: crypto.randomUUID(),
        origin,
        endpoint: input.endpoint,
        p256dhKey: Buffer.from(this.decodeBase64Url(input.keys.p256dh)),
        authSecret: Buffer.from(this.decodeBase64Url(input.keys.auth)),
        createdAt: Date.now(),
        lastPushAt: null,
      });
    } catch (err) {
      this.ctx.logger.error('[push] fallo guardando suscripción', err);
    }
  }

  /**
   * Captura el PushSubscription activo desde el SW de un webContents.
   * Reintenta 3 veces con 500ms entre intentos para evitar race conditions
   * entre la concesión de permiso y la suscripción del SW.
   */
  async captureSubscription(
    wc: WebContents,
    origin: string,
    profileId: string,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(500 * (attempt + 1));

      type PushSubData = { endpoint: string; p256dh: number[] | null; auth: number[] | null };
      let sub: PushSubData | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const raw = await wc.executeJavaScript(`
          (async () => {
            try {
              const reg = await navigator.serviceWorker.ready;
              const s = await reg.pushManager.getSubscription();
              if (!s) return null;
              const p256dh = s.getKey('p256dh');
              const auth = s.getKey('auth');
              return {
                endpoint: s.endpoint,
                p256dh: p256dh ? Array.from(new Uint8Array(p256dh)) : null,
                auth: auth ? Array.from(new Uint8Array(auth)) : null
              };
            } catch { return null; }
          })()
        `, true);
        sub = raw as PushSubData | null;
      } catch {
        // wc puede estar destruido entre intentos
        return false;
      }

      if (sub?.endpoint && sub.p256dh && sub.auth) {
        try {
          const repos = this.ctx.profileManager.getRepositories(profileId);
          repos.pushSubscriptions.upsert({
            id: crypto.randomUUID(),
            origin,
            endpoint: sub.endpoint,
            p256dhKey: Buffer.from(sub.p256dh),
            authSecret: Buffer.from(sub.auth),
            createdAt: Date.now(),
            lastPushAt: null,
          });
          this.ctx.logger.info(`[push] suscripción capturada para ${origin}`);
          return true;
        } catch (err) {
          this.ctx.logger.error('[push] fallo persistiendo suscripción capturada', err);
          return false;
        }
      }
    }

    this.ctx.logger.warn(`[push] no se pudo capturar suscripción para ${origin} tras 3 intentos`);
    return false;
  }

  unsubscribe(profileId: string, origin: string): void {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      repos.pushSubscriptions.delete(origin);
    } catch (err) {
      this.ctx.logger.error('[push] fallo eliminando suscripción', err);
    }
  }

  unsubscribeAll(profileId: string): void {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      repos.pushSubscriptions.deleteAll();
    } catch (err) {
      this.ctx.logger.error('[push] fallo eliminando todas las suscripciones', err);
    }
  }

  listByProfile(profileId: string): PushSubscription[] {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      return repos.pushSubscriptions.findAll();
    } catch {
      return [];
    }
  }

  getByOrigin(profileId: string, origin: string): PushSubscription | null {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      return repos.pushSubscriptions.findByOrigin(origin);
    } catch {
      return null;
    }
  }

  updateLastPushAt(profileId: string, origin: string): void {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      repos.pushSubscriptions.updateLastPushAt(origin, Date.now());
    } catch (err) {
      this.ctx.logger.error('[push] fallo actualizando last_push_at', err);
    }
  }

  async restoreSubscriptions(profileId: string, _session: Session): Promise<void> {
    // Las suscripciones persisten en el storage de Chromium (IndexedDB del SW)
    // entre reinicios, por lo que el SW las recupera automáticamente. Ver ADR 0015.
    const subs = this.listByProfile(profileId);
    this.ctx.logger.info(
      `[push] ${subs.length} suscripciones registradas para perfil ${profileId}`,
    );
  }

  private decodeBase64Url(b64url: string): Uint8Array {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + (4 - (b64.length % 4)) % 4, '=');
    const binary = atob(padded);
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  }
}

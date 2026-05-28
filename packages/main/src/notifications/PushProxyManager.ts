import { createECDH, hkdfSync, createDecipheriv, randomBytes } from 'node:crypto';
import type { Logger } from '../logger';
import type { ProfileManager } from '../profiles/ProfileManager';

const SYNC_SERVER = 'https://sync.vela-browser.com';

interface ProxyKeyEntry {
  token: string;
  privateKey: string; // hex, 32 bytes
  publicKey: string;  // hex, 65 bytes (uncompressed P-256)
  auth: string;       // hex, 16 bytes auth secret
}

export interface ProxySubscription {
  endpoint: string;
  p256dh: string; // base64url
  auth: string;   // base64url
}

export interface PushProxyManagerCtx {
  profileManager: ProfileManager;
  logger: Logger;
}

function toBase64Url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function settingKey(origin: string): string {
  return `push-proxy:key:${origin}`;
}

export class PushProxyManager {
  constructor(private readonly ctx: PushProxyManagerCtx) {}

  private getEntry(profileId: string, origin: string): ProxyKeyEntry | null {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      const raw = repos.settings.get(settingKey(origin));
      if (!raw) return null;
      return JSON.parse(raw) as ProxyKeyEntry;
    } catch {
      return null;
    }
  }

  private createEntry(): ProxyKeyEntry {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    return {
      token: crypto.randomUUID(),
      privateKey: ecdh.getPrivateKey().toString('hex'),
      publicKey: ecdh.getPublicKey().toString('hex'),
      auth: randomBytes(16).toString('hex'),
    };
  }

  private saveEntry(profileId: string, origin: string, entry: ProxyKeyEntry): void {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      repos.settings.set(settingKey(origin), JSON.stringify(entry));
    } catch (err) {
      this.ctx.logger.error('[push-proxy] fallo guardando entrada', err);
    }
  }

  async getOrCreate(profileId: string, origin: string, sessionToken: string): Promise<ProxySubscription | null> {
    let entry = this.getEntry(profileId, origin);
    if (!entry) {
      entry = this.createEntry();
      this.saveEntry(profileId, origin, entry);

      try {
        const res = await fetch(`${SYNC_SERVER}/push/register`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: entry.token,
            profile_id: profileId,
            origin,
          }),
        });
        if (!res.ok) {
          this.ctx.logger.warn(`[push-proxy] register returned ${res.status}`);
        }
      } catch (err) {
        this.ctx.logger.warn('[push-proxy] register failed, keeping local entry', err);
      }
    }

    return {
      endpoint: `${SYNC_SERVER}/push/${entry.token}`,
      p256dh: toBase64Url(Buffer.from(entry.publicKey, 'hex')),
      auth: toBase64Url(Buffer.from(entry.auth, 'hex')),
    };
  }

  get(profileId: string, origin: string): ProxySubscription | null {
    const entry = this.getEntry(profileId, origin);
    if (!entry) return null;
    return {
      endpoint: `${SYNC_SERVER}/push/${entry.token}`,
      p256dh: toBase64Url(Buffer.from(entry.publicKey, 'hex')),
      auth: toBase64Url(Buffer.from(entry.auth, 'hex')),
    };
  }

  remove(profileId: string, origin: string): void {
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      repos.settings.delete(settingKey(origin));
    } catch { /* ignore */ }
  }

  /**
   * Decrypts an RFC 8291 + RFC 8188 (aes128gcm) encrypted push payload.
   * Returns the plaintext UTF-8 string, or null on any error.
   */
  decryptPayload(profileId: string, origin: string, payloadBase64: string): string | null {
    const entry = this.getEntry(profileId, origin);
    if (!entry) return null;

    try {
      const payload = Buffer.from(payloadBase64, 'base64');

      // RFC 8188 header: salt(16) + rs(4) + idlen(1) + keyid(idlen)
      if (payload.length < 21) return null;
      const salt = payload.subarray(0, 16);
      // rs at [16..20] — not needed for single-record payloads
      const idlen = payload[20]!;
      if (payload.length < 21 + idlen) return null;

      // sender's ephemeral P-256 public key (uncompressed = 65 bytes)
      const senderPublicKey = payload.subarray(21, 21 + idlen);

      const recordStart = 21 + idlen;
      const record = payload.subarray(recordStart);
      if (record.length < 17) return null; // 16 GCM tag + 1 delimiter byte minimum

      const ciphertext = record.subarray(0, -16);
      const authTag = record.subarray(-16);

      const ourPrivateKey = Buffer.from(entry.privateKey, 'hex');
      const ourPublicKey = Buffer.from(entry.publicKey, 'hex');
      const authSecret = Buffer.from(entry.auth, 'hex');

      // ECDH shared secret
      const ecdh = createECDH('prime256v1');
      ecdh.setPrivateKey(ourPrivateKey);
      const sharedSecret = ecdh.computeSecret(senderPublicKey);

      // RFC 8291 §3.3: HKDF(auth_secret, IKM, WebPush info, 32) → ICM
      const webPushInfo = Buffer.concat([
        Buffer.from('WebPush: info\x00', 'utf8'),
        ourPublicKey,
        senderPublicKey,
      ]);
      const icm = Buffer.from(hkdfSync('sha256', sharedSecret, authSecret, webPushInfo, 32));

      // RFC 8188 §2.3: HKDF(payload_salt, ICM, ...) → CEK and NONCE
      const cek = Buffer.from(
        hkdfSync('sha256', icm, salt, Buffer.from('Content-Encoding: aes128gcm\x00', 'utf8'), 16),
      );
      const nonce = Buffer.from(
        hkdfSync('sha256', icm, salt, Buffer.from('Content-Encoding: nonce\x00', 'utf8'), 12),
      );

      // AES-128-GCM decrypt
      const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      // Strip padding delimiter (0x02 for last record, scan from end)
      let end = decrypted.length - 1;
      while (end >= 0 && decrypted[end] === 0x00) end--;
      if (end >= 0 && (decrypted[end] === 0x02 || decrypted[end] === 0x01)) end--;
      const plaintext = decrypted.subarray(0, end + 1);

      return plaintext.toString('utf8');
    } catch (err) {
      this.ctx.logger.warn('[push-proxy] decrypt failed', err);
      return null;
    }
  }
}

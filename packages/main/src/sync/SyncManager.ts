import { safeStorage } from 'electron';
import { encrypt, decrypt, deriveKey } from './crypto';
import { serializers } from './serializers';
import { syncEvents, type SyncEntityEvent } from './syncEvents';
import type { ProfileRepositories } from '../profiles/ProfileManager';
import type { Logger } from '../logger';
import type { MainEventBus } from '../ipc/events';

const SERVER_URL = 'https://sync.vela-browser.com';
const WS_URL = 'wss://sync.vela-browser.com';

export interface SyncStatus {
  configured: boolean;
  connected: boolean;
  lastSyncAt: number | null;
  syncInProgress: boolean;
}

interface SyncConfig {
  sessionToken: string;
  syncKey: Buffer;
  profileId: string;
  lastSeq: number;
}

interface RemoteEntity {
  id: string;
  entity_type: string;
  data_ct: string | null;
  updated_at: number;
  deleted: number;
}

export class SyncManager {
  private config: SyncConfig | null = null;
  private ws: WebSocket | null = null;
  private syncInProgress = false;
  private pendingSync = false;
  private reconnectDelay = 1_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSyncAt: number | null = null;

  constructor(
    private readonly profileId: string,
    private readonly getRepos: () => ProfileRepositories,
    private readonly logger: Logger,
    private readonly events: MainEventBus,
    private readonly onPushNotification?: (
      profileId: string,
      origin: string,
      payloadBase64: string,
    ) => void,
  ) { }

  // ── Configuración ──────────────────────────────────────────────────────────

  async configure(sessionToken: string, syncPassword: string): Promise<void> {
    const repos = this.getRepos();

    let saltHex = repos.settings.get('sync:key-salt');
    if (!saltHex) {
      const salt = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32)));
      saltHex = salt.toString('hex');
      repos.settings.set('sync:key-salt', saltHex);
    }

    const lastSeqRaw = repos.settings.get('sync:last-seq');
    const lastSeq = lastSeqRaw ? parseInt(lastSeqRaw, 10) : 0;

    this.config = {
      sessionToken,
      syncKey: deriveKey(syncPassword, Buffer.from(saltHex, 'hex')),
      profileId: this.profileId,
      lastSeq,
    };

    // Persist session token (cifrado en reposo) para que sobreviva reinicios.
    this.persistSessionToken(repos, sessionToken);

    // Encrypt and persist sync key so the session survives restarts
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encrypted = safeStorage.encryptString(this.config.syncKey.toString('hex'));
        repos.settings.set('sync:key-encrypted', encrypted.toString('base64'));
      }
    } catch { /* non-fatal — sync still works for this session */ }

    syncEvents.on('entity:changed', this.onEntityChanged);

    await this.registerProfile();
    this.connect();
    await this.pullChanges();
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  async restoreFromStorage(): Promise<boolean> {
    const repos = this.getRepos();
    const sessionToken = this.readSessionToken(repos);
    const encryptedKeyB64 = repos.settings.get('sync:key-encrypted');
    if (!sessionToken || !encryptedKeyB64) return false;

    try {
      if (!safeStorage.isEncryptionAvailable()) return false;
      const syncKeyHex = safeStorage.decryptString(Buffer.from(encryptedKeyB64, 'base64'));
      const syncKey = Buffer.from(syncKeyHex, 'hex');

      const lastSeqRaw = repos.settings.get('sync:last-seq');
      const lastSeq = lastSeqRaw ? parseInt(lastSeqRaw, 10) : 0;

      this.config = {
        sessionToken,
        syncKey,
        profileId: this.profileId,
        lastSeq,
      };

      syncEvents.on('entity:changed', this.onEntityChanged);
      this.connect();
      await this.pullChanges();
      return true;
    } catch (err) {
      this.logger.warn('[sync] restoreFromStorage falló:', err);
      this.config = null;
      return false;
    }
  }

  async deactivate(): Promise<void> {
    syncEvents.off('entity:changed', this.onEntityChanged);
    this.disconnect();
    this.config = null;
    const repos = this.getRepos();
    repos.settings.set('sync:last-seq', '0');
    repos.settings.delete('sync:session-token');
    repos.settings.delete('sync:session-token-enc');
    repos.settings.delete('sync:key-encrypted');
    this.emitStatus();
  }

  getSessionToken(): string | null {
    return this.config?.sessionToken ?? null;
  }

  /**
   * Persiste el token de sesión cifrado con safeStorage (DPAPI/Keychain/
   * libsecret). El token es un bearer de larga vida: en claro en profile.db
   * permitiría suplantar la sesión a quien lea el fichero. Si safeStorage no
   * está disponible, cae a texto plano (igual que la clave de sync).
   */
  private persistSessionToken(
    repos: ReturnType<SyncManager['getRepos']>,
    token: string,
  ): void {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const enc = safeStorage.encryptString(token).toString('base64');
        repos.settings.set('sync:session-token-enc', enc);
        repos.settings.delete('sync:session-token'); // limpiar legacy en claro
        return;
      }
    } catch {
      /* fallback a texto plano abajo */
    }
    repos.settings.set('sync:session-token', token);
  }

  private readSessionToken(
    repos: ReturnType<SyncManager['getRepos']>,
  ): string | null {
    const enc = repos.settings.get('sync:session-token-enc');
    if (enc) {
      try {
        if (safeStorage.isEncryptionAvailable()) {
          return safeStorage.decryptString(Buffer.from(enc, 'base64'));
        }
      } catch {
        return null;
      }
    }
    // Compat: tokens persistidos en claro por versiones anteriores.
    return repos.settings.get('sync:session-token') ?? null;
  }

  // ── Conexión WebSocket ─────────────────────────────────────────────────────

  private connect(): void {
    if (!this.config) return;

    this.ws = new WebSocket(WS_URL);

    this.ws.addEventListener('open', () => {
      this.reconnectDelay = 1_000;
      this.ws!.send(JSON.stringify({ token: this.config!.sessionToken }));
      this.emitStatus();
    });

    this.ws.addEventListener('message', async (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as { type: string };
        if (msg.type === 'sync:changes') {
          if (!this.syncInProgress) {
            await this.pullChanges();
          } else {
            this.pendingSync = true;
          }
        } else if (msg.type === 'push:notification') {
          const pushMsg = msg as { type: string; origin: string; payload_b64: string };
          if (this.onPushNotification && pushMsg.origin && pushMsg.payload_b64) {
            this.onPushNotification(this.profileId, pushMsg.origin, pushMsg.payload_b64);
          }
        }
      } catch {
        // ignorar mensajes malformados
      }
    });

    this.ws.addEventListener('close', (evt) => {
      const { code, reason } = evt as unknown as { code: number; reason: string };
      this.logger.warn(`[sync] WS cerrado code=${code} reason=${reason ?? ''}`);
      this.ws = null;
      this.emitStatus();
      this.scheduleReconnect();
    });

    this.ws.addEventListener('error', (evt) => {
      const msg = (evt as unknown as { message?: string }).message ?? String(evt);
      this.logger.warn(`[sync] WS error: ${msg}`);
    });
  }

  private disconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (!this.config) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
      this.connect();
    }, this.reconnectDelay);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  // ── Push de cambios locales ────────────────────────────────────────────────

  private readonly onEntityChanged = async (evt: SyncEntityEvent): Promise<void> => {
    if (evt.profileId !== this.profileId) return;
    await this.pushChange(evt.type, evt.id, evt.data, evt.updatedAt);
  };

  async pushChange(
    entityType: string,
    entityId: string,
    data: object | null,
    updatedAt: number,
  ): Promise<void> {
    if (!this.config) return;

    const dataJson = data ? JSON.stringify(data) : null;

    if (!this.isConnected()) {
      this.getRepos().syncPending.upsert(entityType, entityId, dataJson, updatedAt);
      return;
    }

    await this.pushEntities([{
      id: entityId,
      entity_type: entityType,
      data_ct: dataJson
        ? encrypt(dataJson, this.config.syncKey).toString('base64')
        : null,
      updated_at: updatedAt,
      deleted: data === null ? 1 : 0,
    }]);
  }

  private async pushEntities(entities: RemoteEntity[]): Promise<void> {
    if (!this.config || entities.length === 0) return;

    const res = await fetch(`${SERVER_URL}/sync/entities`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.config.sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ profile_id: this.config.profileId, entities }),
    });

    if (!res.ok) {
      throw new Error(`Sync push failed: ${res.status}`);
    }
  }

  // ── Pull de cambios remotos ────────────────────────────────────────────────

  async pullChanges(): Promise<void> {
    if (!this.config || this.syncInProgress) return;

    this.syncInProgress = true;
    this.emitStatus();

    try {
      const res = await fetch(
        `${SERVER_URL}/sync/entities?profile_id=${this.config.profileId}&since_seq=${this.config.lastSeq}`,
        { headers: { Authorization: `Bearer ${this.config.sessionToken}` } },
      );

      if (!res.ok) {
        if (res.status === 401) {
          this.events.emit('sync:session-expired' as any, { profileId: this.profileId });
        }
        return;
      }

      const body = await res.json() as { entities: RemoteEntity[]; current_seq: number };

      for (const entity of body.entities) {
        try {
          await this.applyRemoteEntity(entity);
        } catch (e) {
          // Una entidad inválida (p.ej. userscript que no pasa validación) se
          // descarta sin abortar el resto del lote ni bloquear el avance de seq.
          this.logger.warn(
            `[sync] entidad descartada ${entity.entity_type}/${entity.id}:`,
            e,
          );
        }
      }

      this.config.lastSeq = body.current_seq;
      this.getRepos().settings.set('sync:last-seq', String(body.current_seq));
      this.lastSyncAt = Date.now();

      await this.flushPending();

    } catch (err) {
      this.logger.warn('[sync] pull failed:', err);
    } finally {
      this.syncInProgress = false;
      this.emitStatus();
      if (this.pendingSync) {
        this.pendingSync = false;
        await this.pullChanges();
      }
    }
  }

  private async applyRemoteEntity(entity: RemoteEntity): Promise<void> {
    if (!this.config) return;

    let data: object | null = null;

    if (!entity.deleted && entity.data_ct) {
      try {
        const packed = Buffer.from(entity.data_ct, 'base64');
        const plain = decrypt(packed, this.config.syncKey);
        data = JSON.parse(plain.toString('utf-8')) as object;
      } catch (e) {
        this.logger.warn(`[sync] decrypt failed for ${entity.id}:`, e);
        return;
      }
    }

    await this.mergeEntity(
      entity.entity_type,
      entity.id,
      data,
      entity.updated_at,
      entity.deleted === 1,
    );
  }

  private async mergeEntity(
    type: string,
    id: string,
    data: object | null,
    remoteUpdatedAt: number,
    deleted: boolean,
  ): Promise<void> {
    const repos = this.getRepos();
    const s = serializers[type];
    if (!s) {
      this.logger.warn(`[sync] no serializer for type: ${type}`);
      return;
    }

    const localUpdatedAt = await s.getUpdatedAt(id, repos) ?? 0;
    if (localUpdatedAt >= remoteUpdatedAt) return;

    if (deleted) {
      await s.applyDelete(id, repos);
    } else if (data) {
      await s.applyUpsert(data, repos);
    }

    this.events.emit('state:sync-entity-updated' as any, { type, id, deleted });
  }

  // ── Cola offline ───────────────────────────────────────────────────────────

  private async flushPending(): Promise<void> {
    if (!this.config || !this.isConnected()) return;

    const pending = this.getRepos().syncPending.listAll();
    if (pending.length === 0) return;

    const entities: RemoteEntity[] = pending.map((p) => ({
      id: p.entity_id,
      entity_type: p.entity_type,
      data_ct: p.data_json
        ? encrypt(p.data_json, this.config!.syncKey).toString('base64')
        : null,
      updated_at: p.updated_at,
      deleted: p.data_json === null ? 1 : 0,
    }));

    await this.pushEntities(entities);
    this.getRepos().syncPending.clearAll();
  }

  // ── Registro del perfil ────────────────────────────────────────────────────

  private async registerProfile(): Promise<void> {
    if (!this.config) return;

    const repos = this.getRepos();
    // El nombre del perfil es un ajuste global; usamos un placeholder cifrado.
    const namePlaceholder = `profile-${this.profileId}`;
    const nameCt = encrypt(namePlaceholder, this.config.syncKey).toString('base64');

    await fetch(`${SERVER_URL}/sync/profiles`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: this.config.profileId, name_ct: nameCt }),
    }).catch((err) => {
      this.logger.warn('[sync] register profile failed:', err);
    });

    void repos; // evitar warning de unused
  }

  // ── Vault ──────────────────────────────────────────────────────────────────

  async pushVault(vaultData: Buffer, updatedAt: number): Promise<void> {
    if (!this.config) return;

    const vaultCt = encrypt(vaultData, this.config.syncKey).toString('base64');

    await fetch(`${SERVER_URL}/sync/vault`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.config.sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile_id: this.config.profileId,
        vault_ct: vaultCt,
        updated_at: updatedAt,
      }),
    });
  }

  async pullVault(): Promise<Buffer | null> {
    if (!this.config) return null;

    const res = await fetch(
      `${SERVER_URL}/sync/vault?profile_id=${this.config.profileId}`,
      { headers: { Authorization: `Bearer ${this.config.sessionToken}` } },
    );

    if (res.status === 404) return null;
    if (!res.ok) return null;

    const { vault_ct } = await res.json() as { vault_ct: string };
    try {
      return decrypt(Buffer.from(vault_ct, 'base64'), this.config.syncKey);
    } catch (e) {
      this.logger.warn('[sync] vault decrypt failed:', e);
      return null;
    }
  }

  // ── Yjs / quick_notes ──────────────────────────────────────────────────────

  async pushYDoc(workspaceId: string, state: Buffer): Promise<void> {
    if (!this.config) return;

    const docCt = encrypt(state, this.config.syncKey).toString('base64');

    await fetch(`${SERVER_URL}/sync/ydocs/${workspaceId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.config.sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile_id: this.config.profileId,
        doc_ct: docCt,
        updated_at: Date.now(),
      }),
    });
  }

  async pullYDoc(workspaceId: string): Promise<Buffer | null> {
    if (!this.config) return null;

    const res = await fetch(
      `${SERVER_URL}/sync/ydocs/${workspaceId}?profile_id=${this.config.profileId}`,
      { headers: { Authorization: `Bearer ${this.config.sessionToken}` } },
    );

    if (res.status === 404) return null;
    if (!res.ok) return null;

    const { doc_ct } = await res.json() as { doc_ct: string };
    try {
      return decrypt(Buffer.from(doc_ct, 'base64'), this.config.syncKey);
    } catch {
      return null;
    }
  }

  // ── Dispositivos ───────────────────────────────────────────────────────────

  async getDevices(): Promise<unknown[]> {
    if (!this.config) return [];

    const res = await fetch(`${SERVER_URL}/sync/devices`, {
      headers: { Authorization: `Bearer ${this.config.sessionToken}` },
    });
    if (!res.ok) return [];
    const { devices } = await res.json() as {
      devices: Array<{
        token_suffix: string;
        device_name: string | null;
        created_at: number;
        last_used_at: number;
      }>;
    };
    const currentSuffix = this.config.sessionToken.slice(-8);
    return devices.map((d) => ({
      tokenSuffix: d.token_suffix,
      userAgent: d.device_name ?? 'Dispositivo',
      lastSeenAt: d.last_used_at,
      isCurrent: d.token_suffix === currentSuffix,
    }));
  }

  async disconnectDevice(tokenSuffix: string): Promise<void> {
    if (!this.config) return;
    await fetch(`${SERVER_URL}/sync/devices/${tokenSuffix}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.config.sessionToken}` },
    });
  }

  // ── Estado ─────────────────────────────────────────────────────────────────

  getStatus(): SyncStatus {
    return {
      configured: this.isConfigured(),
      connected: this.isConnected(),
      lastSyncAt: this.lastSyncAt,
      syncInProgress: this.syncInProgress,
    };
  }

  private emitStatus(): void {
    this.events.emit(
      'state:sync-status-changed' as any,
      { profileId: this.profileId, status: this.getStatus() },
    );
  }

  destroy(): void {
    syncEvents.off('entity:changed', this.onEntityChanged);
    this.disconnect();
    this.config = null;
  }
}

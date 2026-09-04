import { safeStorage } from 'electron';
import { SYNC_TYPE_TO_CATEGORY, type SyncCategory } from '@vela/shared';
import * as os from 'node:os';
import { encrypt, decrypt, deriveKey } from './crypto';
import { serializers } from './serializers';
import { syncEvents, type SyncEntityEvent } from './syncEvents';
import type { ProfileRepositories } from '../profiles/ProfileManager';
import type { PasswordEntry } from '../passwords/PasswordVault';
import type { Logger } from '../logger';
import type { MainEventBus } from '../ipc/events';

const SERVER_URL = 'https://sync.vela-browser.com';
const WS_URL = 'wss://sync.vela-browser.com';

/** El servidor acepta 1000 entidades por petición; dejamos margen. */
/**
 * Vueltas máximas de una misma llamada a `pullChanges`. Cada una es una página
 * del servidor o un aviso que llegó mientras bajábamos la anterior; el tope
 * evita que un servidor que siempre responda "hay más" deje al proceso main
 * girando sin atender nada más.
 */
const MAX_PULL_ROUNDS = 50;

/** Espera antes de atender un aviso del servidor, para agrupar las ráfagas. */
const PULL_DEBOUNCE_MS = 250;

const PUSH_BATCH_SIZE = 200;

/**
 * Tope de payload por petición. El servidor monta `express.json({ limit:
 * '2mb' })`, así que un lote más grande se rechazaría entero: mejor partirlo
 * aquí. Un favicon en base64 dentro de una pestaña ya pesa lo suyo.
 */
const PUSH_BATCH_BYTES = 1_200_000;

export interface SyncStatus {
  configured: boolean;
  connected: boolean;
  lastSyncAt: number | null;
  syncInProgress: boolean;
}

/** Un perfil ya existente en el servidor, ofrecido al vincular un dispositivo. */
export interface RemoteProfileInfo {
  id: string;
  /** Nombre descifrado. null si la contraseña de sync no lo abre. */
  name: string | null;
  host: string | null;
  updatedAt: number;
}

interface SyncConfig {
  sessionToken: string;
  syncKey: Buffer;
  /**
   * Id del perfil EN EL SERVIDOR. No tiene por qué coincidir con el id local
   * del perfil: cada instalación de Vela genera sus propios UUID, así que dos
   * dispositivos del mismo usuario deben apuntar al mismo perfil remoto para
   * verse los datos. Se elige al vincular y se persiste.
   */
  remoteProfileId: string;
  lastSeq: number;
}

interface RemoteEntity {
  id: string;
  entity_type: string;
  data_ct: string | null;
  updated_at: number;
  deleted: number;
}

/** Descarga (o fija, si es el primer dispositivo) el salt del usuario. */
async function fetchCanonicalSalt(sessionToken: string): Promise<Buffer> {
  const candidate = Buffer.from(
    globalThis.crypto.getRandomValues(new Uint8Array(32)),
  ).toString('hex');

  const res = await fetch(`${SERVER_URL}/sync/key-salt`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ salt: candidate }),
  });

  if (!res.ok) {
    throw new Error(`No se pudo obtener el salt de sync: ${res.status}`);
  }

  const { salt } = (await res.json()) as { salt: string };
  return Buffer.from(salt, 'hex');
}

/**
 * Perfiles que el usuario ya tiene en el servidor, con el nombre descifrado
 * cuando la contraseña es correcta. Se consulta antes de configurar: permite
 * vincular este dispositivo a un perfil existente en vez de crear uno nuevo
 * que nunca vería los datos de los demás.
 */
export async function listRemoteProfiles(
  sessionToken: string,
  syncPassword: string,
): Promise<RemoteProfileInfo[]> {
  const salt = await fetchCanonicalSalt(sessionToken);
  const key = deriveKey(syncPassword, salt);

  const res = await fetch(`${SERVER_URL}/sync/profiles`, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (!res.ok) throw new Error(`No se pudieron listar los perfiles: ${res.status}`);

  const { profiles } = (await res.json()) as {
    profiles: Array<{ id: string; name_ct: string; updated_at: number }>;
  };

  return profiles.map((p) => {
    let name: string | null = null;
    let host: string | null = null;
    try {
      const plain = decrypt(Buffer.from(p.name_ct, 'base64'), key).toString('utf-8');
      // Los perfiles creados por versiones anteriores guardaban un string
      // plano ("profile-<uuid>"); los nuevos, un JSON con nombre y equipo.
      if (plain.startsWith('{')) {
        const parsed = JSON.parse(plain) as { name?: string; host?: string };
        name = parsed.name ?? null;
        host = parsed.host ?? null;
      } else {
        name = plain;
      }
    } catch {
      // Contraseña incorrecta o perfil cifrado con otra clave: queda ilegible.
    }
    return { id: p.id, name, host, updatedAt: p.updated_at };
  });
}

export class SyncManager {
  private config: SyncConfig | null = null;
  private ws: WebSocket | null = null;
  private syncInProgress = false;
  private pendingSync = false;
  private pullDebounce: ReturnType<typeof setTimeout> | null = null;
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
    private readonly getProfileName?: () => string,
  ) { }

  // ── Configuración ──────────────────────────────────────────────────────────

  /**
   * Vincula este perfil local con un perfil del servidor.
   *
   * @param remoteProfileId perfil remoto al que engancharse. `null` crea uno
   *   nuevo usando el id local. Elegir el perfil correcto es lo que hace que
   *   dos dispositivos se vean: el servidor particiona TODO por este id.
   */
  async configure(
    sessionToken: string,
    syncPassword: string,
    remoteProfileId: string | null = null,
  ): Promise<void> {
    const repos = this.getRepos();

    // El salt lo fija el primer dispositivo y lo comparten todos: derivar con
    // salts distintos daría claves distintas y el descifrado fallaría siempre.
    const salt = await fetchCanonicalSalt(sessionToken);
    repos.settings.set('sync:key-salt', salt.toString('hex'));

    const targetProfileId = remoteProfileId ?? this.profileId;
    const previousProfileId = repos.settings.get('sync:remote-profile-id');
    // Cambiar de perfil remoto invalida la secuencia: hay que releerlo entero.
    const lastSeqRaw =
      previousProfileId === targetProfileId ? repos.settings.get('sync:last-seq') : null;

    this.config = {
      sessionToken,
      syncKey: deriveKey(syncPassword, salt),
      remoteProfileId: targetProfileId,
      lastSeq: lastSeqRaw ? parseInt(lastSeqRaw, 10) : 0,
    };

    repos.settings.set('sync:remote-profile-id', targetProfileId);
    repos.settings.set('sync:last-seq', String(this.config.lastSeq));

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

    // Orden importante: primero subimos lo que ya hay en este dispositivo y
    // luego bajamos lo remoto. Sin el push inicial, un dispositivo con datos
    // no aportaba nada al servidor hasta que el usuario tocaba algo, y uno
    // recién vinculado no encontraba nada que bajar.
    await this.pushAllLocal();
    await this.syncAll();
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

      // Vinculación anterior al arreglo del perfil remoto: cada dispositivo
      // usaba su id local como id de perfil en el servidor y derivaba la clave
      // con un salt propio, así que jamás llegó a sincronizar nada. Mantenerla
      // solo sirve para que la UI diga "conectado" mientras no viaja un dato:
      // se limpia para que el usuario vuelva a vincular y esta vez funcione.
      const remoteProfileId = repos.settings.get('sync:remote-profile-id');
      if (!remoteProfileId) {
        this.logger.warn(
          '[sync] vinculación de una versión anterior detectada — hay que volver a activar la sincronización',
        );
        repos.settings.delete('sync:session-token');
        repos.settings.delete('sync:session-token-enc');
        repos.settings.delete('sync:key-encrypted');
        repos.settings.set('sync:last-seq', '0');
        return false;
      }

      this.config = { sessionToken, syncKey, remoteProfileId, lastSeq };

      syncEvents.on('entity:changed', this.onEntityChanged);
      this.connect();
      await this.syncAll();
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
    repos.settings.delete('sync:remote-profile-id');
    this.emitStatus();
  }

  getSessionToken(): string | null {
    return this.config?.sessionToken ?? null;
  }

  getRemoteProfileId(): string | null {
    return this.config?.remoteProfileId ?? null;
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
      // Al recuperar la conexión, vaciar lo que se encoló estando offline.
      void this.flushPending();
    });

    this.ws.addEventListener('message', async (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as { type: string };
        if (msg.type === 'sync:changes') {
          const changeMsg = msg as { type: string; profile_id?: string };
          // El servidor avisa a todos los dispositivos del usuario; solo nos
          // interesan los cambios de NUESTRO perfil remoto.
          if (
            changeMsg.profile_id &&
            changeMsg.profile_id !== this.config?.remoteProfileId
          ) {
            return;
          }
          this.schedulePull();
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
    if (this.pullDebounce !== null) {
      clearTimeout(this.pullDebounce);
      this.pullDebounce = null;
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

  // ── Categorías activas ─────────────────────────────────────────────────────

  /**
   * Categorías que el usuario ha desactivado en `vela://settings#sync`.
   *
   * Vive en `sync:disabled-categories`, que por el prefijo `sync:` NO se
   * sincroniza: la elección es de este dispositivo. Sincronizarla crearía
   * paradojas (desactivar "Configuración del perfil" impediría que viajara la
   * propia lista de exclusiones).
   *
   * Se lee del store en cada operación en vez de cachearse: son lecturas de
   * SQLite en memoria y así un cambio en los ajustes surte efecto en el
   * siguiente ciclo sin invalidaciones que mantener.
   */
  private disabledCategories(): Set<SyncCategory> {
    try {
      const raw = this.getRepos().settings.get('sync:disabled-categories');
      if (!raw) return new Set();
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((c): c is SyncCategory => typeof c === 'string'));
    } catch {
      // Ajuste corrupto: mejor sincronizar de más que dejar de sincronizar.
      return new Set();
    }
  }

  /**
   * Si el usuario ha vuelto a activar una categoría, rebobina la secuencia
   * para releer el historial completo del servidor.
   *
   * Mientras una categoría está desactivada sus entidades se descartan en
   * `mergeEntity`, pero el lote avanza `lastSeq` igual. Sin este rebobinado,
   * al reactivarla no llegaría nada hasta que el otro dispositivo volviera a
   * tocar esas entidades. El re-pull es idempotente: el LWW descarta lo que ya
   * esté al día.
   */
  private rewindIfCategoryReenabled(disabled: Set<SyncCategory>): void {
    if (!this.config) return;
    const repos = this.getRepos();
    const previousRaw = repos.settings.get('sync:last-disabled-categories');

    let previous: string[] = [];
    if (previousRaw) {
      try {
        const parsed = JSON.parse(previousRaw) as unknown;
        if (Array.isArray(parsed)) previous = parsed.filter((c) => typeof c === 'string');
      } catch { /* valor corrupto: se trata como lista vacía */ }
    }

    const current = [...disabled].sort();
    if (previousRaw !== null && previous.some((c) => !disabled.has(c as SyncCategory))) {
      this.logger.info('[sync] categoría reactivada — releyendo el historial remoto');
      this.config.lastSeq = 0;
      repos.settings.set('sync:last-seq', '0');
    }

    if (JSON.stringify(current) !== JSON.stringify(previous.sort())) {
      repos.settings.set('sync:last-disabled-categories', JSON.stringify(current));
    }
  }

  /**
   * Filtra por categoría. Se aplica en los DOS sentidos: si solo se filtrara
   * al enviar, el otro dispositivo seguiría metiendo aquí sus workspaces.
   */
  private isTypeEnabled(entityType: string, disabled: Set<SyncCategory>): boolean {
    const category = SYNC_TYPE_TO_CATEGORY[entityType];
    // Un tipo sin categoría conocida se sincroniza: no dejamos datos fuera por
    // haber olvidado registrarlo.
    return category === undefined || !disabled.has(category);
  }

  // ── Push de cambios locales ────────────────────────────────────────────────

  private readonly onEntityChanged = async (evt: SyncEntityEvent): Promise<void> => {
    if (evt.profileId !== this.profileId) return;
    if (!this.isTypeEnabled(evt.type, this.disabledCategories())) return;
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

    try {
      await this.pushEntities([{
        id: entityId,
        entity_type: entityType,
        data_ct: dataJson
          ? encrypt(dataJson, this.config.syncKey).toString('base64')
          : null,
        updated_at: updatedAt,
        deleted: data === null ? 1 : 0,
      }]);
    } catch (err) {
      // Un fallo de red no puede perder la mutación: se encola para el
      // siguiente flush, igual que si estuviéramos offline.
      this.logger.warn(`[sync] push de ${entityType}/${entityId} falló, encolado:`, err);
      this.getRepos().syncPending.upsert(entityType, entityId, dataJson, updatedAt);
    }
  }

  private async pushEntities(entities: RemoteEntity[]): Promise<void> {
    if (!this.config || entities.length === 0) return;

    for (const batch of this.splitIntoBatches(entities)) {
      const res = await fetch(`${SERVER_URL}/sync/entities`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.config.sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          profile_id: this.config.remoteProfileId,
          entities: batch,
        }),
      });

      if (!res.ok) {
        throw new Error(`Sync push failed: ${res.status}`);
      }
    }
  }

  /** Parte por número de entidades y por tamaño, lo que llegue antes. */
  private splitIntoBatches(entities: RemoteEntity[]): RemoteEntity[][] {
    const batches: RemoteEntity[][] = [];
    let current: RemoteEntity[] = [];
    let bytes = 0;

    for (const entity of entities) {
      const size = (entity.data_ct?.length ?? 0) + entity.id.length + 100;
      if (current.length > 0 && (current.length >= PUSH_BATCH_SIZE || bytes + size > PUSH_BATCH_BYTES)) {
        batches.push(current);
        current = [];
        bytes = 0;
      }
      current.push(entity);
      bytes += size;
    }
    if (current.length > 0) batches.push(current);
    return batches;
  }

  /**
   * Sube el estado local completo. Se ejecuta al vincular el dispositivo, de
   * modo que lo que ya había aquí llega al servidor y de ahí al resto de
   * dispositivos. La fusión la resuelve el LWW por `updatedAt` de cada lado.
   */
  async pushAllLocal(): Promise<void> {
    if (!this.config) return;
    const repos = this.getRepos();
    const key = this.config.syncKey;

    const disabled = this.disabledCategories();
    const entities: RemoteEntity[] = [];
    const add = (type: string, id: string, payload: object, updatedAt: number): void => {
      if (!this.isTypeEnabled(type, disabled)) return;
      entities.push({
        id,
        entity_type: type,
        data_ct: encrypt(JSON.stringify(payload), key).toString('base64'),
        updated_at: updatedAt,
        deleted: 0,
      });
    };

    try {
      for (const ws of repos.workspaces.listAll()) {
        const data = serializers['workspace']!.toSync(ws) as { updatedAt: number };
        add('workspace', ws.id, data, data.updatedAt);
      }

      for (const node of repos.treeNodes.listAll()) {
        const data = serializers['treenode']!.toSync(node) as { updatedAt: number };
        add('treenode', node.id, data, data.updatedAt);
      }

      for (const fav of repos.favorites.list()) {
        const data = serializers['favorite']!.toSync(fav) as { updatedAt: number };
        add('favorite', fav.id, data, data.updatedAt);
      }

      for (const script of repos.userScripts.list()) {
        const data = serializers['user_script']!.toSync(script) as { updatedAt: number };
        add('user_script', script.id, data, data.updatedAt);
      }

      for (const exc of repos.adBlockerExceptions.listAll()) {
        const data = serializers['adblocker_exception']!.toSync(exc) as { updatedAt: number };
        add('adblocker_exception', exc.id, data, data.updatedAt);
      }

      for (const setting of repos.settings.listSyncable()) {
        add(
          'setting',
          setting.key,
          {
            id: setting.key,
            key: setting.key,
            value: setting.value,
            updatedAt: setting.updatedAt,
          },
          setting.updatedAt,
        );
      }

      await this.pushEntities(entities);
      this.logger.info(`[sync] push inicial: ${entities.length} entidades subidas`);
    } catch (err) {
      this.logger.warn('[sync] push inicial falló:', err);
      return;
    }

    await this.pushVaultSnapshot();
  }

  // ── Pull de cambios remotos ────────────────────────────────────────────────

  /** Ciclo completo: entidades + vault + notas rápidas. */
  async syncAll(): Promise<void> {
    await this.pullChanges();
    await this.pullVaultSnapshot();
    await this.syncQuickNotes();
  }

  /**
   * Agrupa los avisos del servidor: uno solo dispara el pull, y los que lleguen
   * mientras baja se atienden en la misma tanda. Sin esta coalescencia una
   * ráfaga de avisos se traducía en un pull por aviso, cada uno con su fetch,
   * su descifrado y su escritura SQLite síncrona en el proceso main.
   */
  private schedulePull(): void {
    if (this.syncInProgress) {
      this.pendingSync = true;
      return;
    }
    if (this.pullDebounce !== null) return;
    this.pullDebounce = setTimeout(() => {
      this.pullDebounce = null;
      void this.pullChanges();
    }, PULL_DEBOUNCE_MS);
    if (typeof this.pullDebounce.unref === 'function') this.pullDebounce.unref();
  }

  /**
   * Baja los cambios remotos. Encadena en un bucle —nunca por recursión— las
   * vueltas que hagan falta: las páginas que el servidor no pudo entregar de
   * una vez y los avisos que hayan llegado mientras estábamos ocupados. La
   * versión recursiva anterior anidaba una llamada por aviso y con un flujo
   * sostenido crecía la pila hasta desbordarla.
   */
  async pullChanges(): Promise<void> {
    if (!this.config || this.syncInProgress) return;

    this.syncInProgress = true;
    this.emitStatus();
    try {
      let guard = 0;
      // Cota dura: un servidor que siempre dijera "hay más" no puede dejar al
      // proceso main girando indefinidamente sin atender nada más.
      while (guard++ < MAX_PULL_ROUNDS) {
        const hasMore = await this.pullOnce();
        if (hasMore) continue;
        if (!this.pendingSync) break;
        this.pendingSync = false;
      }
    } finally {
      this.syncInProgress = false;
      this.pendingSync = false;
      this.emitStatus();
    }
  }

  /** Una vuelta de pull. Devuelve `true` si el servidor dejó cambios sin enviar. */
  private async pullOnce(): Promise<boolean> {
    if (!this.config) return false;

    let hasMore = false;

    try {
      this.rewindIfCategoryReenabled(this.disabledCategories());

      const res = await fetch(
        `${SERVER_URL}/sync/entities?profile_id=${this.config.remoteProfileId}&since_seq=${this.config.lastSeq}`,
        { headers: { Authorization: `Bearer ${this.config.sessionToken}` } },
      );

      if (!res.ok) {
        if (res.status === 401) {
          this.events.emit('sync:session-expired' as any, { profileId: this.profileId });
        } else {
          this.logger.warn(`[sync] pull devolvió ${res.status}`);
        }
        return false;
      }

      const body = await res.json() as {
        entities: RemoteEntity[];
        current_seq: number;
        has_more?: boolean;
      };

      hasMore = body.has_more === true;

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
      return false;
    }

    return hasMore;
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
    if (!this.isTypeEnabled(type, this.disabledCategories())) return;

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

    // Lo encolado antes de desactivar una categoría tampoco debe salir.
    const disabled = this.disabledCategories();
    const entities: RemoteEntity[] = pending
      .filter((p) => this.isTypeEnabled(p.entity_type, disabled))
      .map((p) => ({
        id: p.entity_id,
        entity_type: p.entity_type,
        data_ct: p.data_json
          ? encrypt(p.data_json, this.config!.syncKey).toString('base64')
          : null,
        updated_at: p.updated_at,
        deleted: p.data_json === null ? 1 : 0,
      }));

    try {
      await this.pushEntities(entities);
      this.getRepos().syncPending.clearAll();
    } catch (err) {
      // La cola se conserva para el siguiente intento.
      this.logger.warn('[sync] flush de la cola offline falló:', err);
    }
  }

  // ── Registro del perfil ────────────────────────────────────────────────────

  private async registerProfile(): Promise<void> {
    if (!this.config) return;

    // El nombre viaja cifrado: el servidor no debe poder leerlo. Sirve para
    // que al vincular un segundo dispositivo el usuario reconozca su perfil.
    const payload = JSON.stringify({
      name: this.getProfileName?.() ?? 'Perfil',
      host: os.hostname(),
    });
    const nameCt = encrypt(payload, this.config.syncKey).toString('base64');

    await fetch(`${SERVER_URL}/sync/profiles`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: this.config.remoteProfileId, name_ct: nameCt }),
    }).catch((err) => {
      this.logger.warn('[sync] register profile failed:', err);
    });
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
        profile_id: this.config.remoteProfileId,
        vault_ct: vaultCt,
        updated_at: updatedAt,
      }),
    });
  }

  async pullVault(): Promise<Buffer | null> {
    if (!this.config) return null;

    const res = await fetch(
      `${SERVER_URL}/sync/vault?profile_id=${this.config.remoteProfileId}`,
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

  /**
   * Sube el vault entero como un único blob cifrado con la clave de sync.
   * Las entradas viajan descifradas DENTRO del blob porque en cada dispositivo
   * están cifradas con la clave de su propio perfil, que nunca sale de ahí.
   */
  async pushVaultSnapshot(): Promise<void> {
    if (!this.config) return;
    if (this.disabledCategories().has('passwords')) return;
    try {
      const repos = this.getRepos();
      const entries = repos.passwordVault.exportAll();
      if (entries.length === 0) return;
      await this.pushVault(
        Buffer.from(JSON.stringify(entries), 'utf-8'),
        repos.passwordVault.latestUpdatedAt() || Date.now(),
      );
    } catch (err) {
      // Perfil bloqueado (sin clave en memoria) o red caída: no es fatal.
      this.logger.warn('[sync] push del vault falló:', err);
    }
  }

  /** Fusiona el vault remoto con el local, entrada a entrada y con LWW. */
  async pullVaultSnapshot(): Promise<void> {
    if (!this.config) return;
    if (this.disabledCategories().has('passwords')) return;
    try {
      const blob = await this.pullVault();
      if (!blob) return;
      const entries = JSON.parse(blob.toString('utf-8')) as PasswordEntry[];
      const repos = this.getRepos();
      for (const entry of entries) {
        try {
          repos.passwordVault.syncUpsert(entry);
        } catch (e) {
          this.logger.warn(`[sync] entrada de vault descartada ${entry?.id}:`, e);
        }
      }
    } catch (err) {
      this.logger.warn('[sync] pull del vault falló:', err);
    }
  }

  // ── Yjs / quick_notes ──────────────────────────────────────────────────────

  async pushYDoc(workspaceId: string, state: Buffer): Promise<void> {
    if (!this.config) return;
    if (this.disabledCategories().has('notes')) return;

    const docCt = encrypt(state, this.config.syncKey).toString('base64');

    await fetch(`${SERVER_URL}/sync/ydocs/${workspaceId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.config.sessionToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile_id: this.config.remoteProfileId,
        doc_ct: docCt,
        updated_at: Date.now(),
      }),
    });
  }

  async pullYDoc(workspaceId: string): Promise<Buffer | null> {
    if (!this.config) return null;
    if (this.disabledCategories().has('notes')) return null;

    const res = await fetch(
      `${SERVER_URL}/sync/ydocs/${workspaceId}?profile_id=${this.config.remoteProfileId}`,
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

  /**
   * Fusiona las notas rápidas de todos los workspaces. El merge lo resuelve
   * Yjs (CRDT), así que no hay pérdida aunque se editen en dos sitios a la vez.
   */
  async syncQuickNotes(): Promise<void> {
    if (!this.config) return;
    if (this.disabledCategories().has('notes')) return;
    const repos = this.getRepos();
    // Import diferido: yjs-sync importa este módulo para su tipo, y cargarlo
    // arriba crearía un ciclo en tiempo de carga.
    const { loadYDocWithSync } = await import('./yjs-sync');
    for (const ws of repos.workspaces.listAll()) {
      try {
        await loadYDocWithSync(this.profileId, ws.id, repos, this);
      } catch (err) {
        this.logger.warn(`[sync] notas de ${ws.id} no sincronizadas:`, err);
      }
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

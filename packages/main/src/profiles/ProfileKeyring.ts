import sodium from 'libsodium-wrappers-sumo';
import type { ProfileSettingsRepository } from '../storage/repositories';
import type { Logger } from '../logger';
import { InvariantViolationError } from '../lib/errors';
import {
  InvalidMasterPasswordError,
  MasterPasswordRequiredError,
} from './ProfileManager';

const KEY_LEN = 32;

const SETTING_MODE = 'keyring:mode';
const SETTING_WRAPPED_KEY = 'keyring:wrapped-key';
const SETTING_SALT = 'keyring:salt';
const SETTING_NONCE = 'keyring:nonce';
const SETTING_SAFE_STORAGE_BLOB = 'keyring:safe-storage-blob';

type KeyringMode = 'master-password' | 'safe-storage';

/**
 * Adaptador inyectable para no acoplar el keyring a `electron`. El binding
 * real (`electronSafeStorage`) lo construye main/index.ts; los tests
 * inyectan un mock en memoria. La superficie es la mínima necesaria:
 * cifrado/descifrado simétrico bajo la clave de la cuenta del SO.
 */
export interface SafeStorageAdapter {
  /** True cuando el OS tiene un backend disponible. En Linux sin libsecret
   *  puede ser false; en ese caso obligamos a usar contraseña maestra. */
  isEncryptionAvailable(): boolean;
  encryptString(plaintext: string): Buffer;
  decryptString(ciphertext: Buffer): string;
}

export class ProfileLockedError extends Error {
  readonly profileId: string;
  constructor(profileId: string) {
    super(`Profile ${profileId} is locked`);
    this.name = 'ProfileLockedError';
    this.profileId = profileId;
  }
}

export class SafeStorageUnavailableError extends Error {
  constructor() {
    super(
      'safeStorage backend no disponible — el perfil debe usar contraseña maestra',
    );
    this.name = 'SafeStorageUnavailableError';
  }
}

export interface ProfileKeyringCtx {
  logger: Logger;
  safeStorage: SafeStorageAdapter;
}

function toB64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    'base64',
  );
}

function fromB64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, 'base64'));
}

/**
 * Custodia de las claves simétricas por perfil. Cada perfil tiene una
 * "profile key" de 32 bytes que cifra todos los datos sensibles en su
 * profile.db (PasswordVault hoy; API keys de IA en Fase 5). La forma en que
 * la clave se persiste depende del modo:
 *
 *   - 'master-password': la clave se envuelve con una KEK derivada de la
 *     contraseña maestra del usuario via Argon2id, y se guarda envuelta en
 *     `settings_profile` (wrapped-key, salt, nonce). Una contraseña incorrecta
 *     se detecta por el fallo de autenticación de XChaCha20-Poly1305 al
 *     descifrar — no necesitamos un verify_token aparte.
 *
 *   - 'safe-storage': la clave en base64 se cifra con `safeStorage` de
 *     Electron (Keychain/DPAPI/libsecret) y se guarda en `settings_profile`.
 *     Es el modo por defecto cuando el usuario no quiere fricción de unlock.
 *
 * En ambos modos, una vez desbloqueada, la clave vive en memoria como
 * Uint8Array y se zerifica con `sodium.memzero` al hacer lock.
 */
export class ProfileKeyring {
  private readonly keysInMemory = new Map<string, Uint8Array>();
  private readyPromise: Promise<void> | null = null;

  constructor(private readonly ctx: ProfileKeyringCtx) {}

  async ensureSodiumReady(): Promise<void> {
    if (!this.readyPromise) this.readyPromise = sodium.ready;
    await this.readyPromise;
  }

  isUnlocked(profileId: string): boolean {
    return this.keysInMemory.has(profileId);
  }

  /**
   * Devuelve la clave del perfil. El caller (PasswordVault y futuros
   * consumidores) NO debe persistirla ni propagarla; la ownership sigue
   * siendo del keyring, que la zerifica al hacer lock.
   */
  getKey(profileId: string): Uint8Array {
    const key = this.keysInMemory.get(profileId);
    if (!key) throw new ProfileLockedError(profileId);
    return key;
  }

  /**
   * Crea la clave para un perfil recién creado. Si `masterPassword` se
   * proporciona, queda en modo wrapped; si no, en safe-storage.
   * Persiste el modo y los blobs necesarios en `settings_profile`.
   */
  async createKeyForProfile(
    profileId: string,
    settings: ProfileSettingsRepository,
    masterPassword?: string,
  ): Promise<void> {
    await this.ensureSodiumReady();
    const key = sodium.randombytes_buf(KEY_LEN);
    try {
      if (masterPassword) {
        this.persistMasterPasswordMode(settings, key, masterPassword);
      } else {
        this.persistSafeStorageMode(settings, key);
      }
      this.keysInMemory.set(profileId, key);
      this.ctx.logger.info(
        `[keyring] clave creada para profile=${profileId} modo=${
          masterPassword ? 'master-password' : 'safe-storage'
        }`,
      );
    } catch (err) {
      sodium.memzero(key);
      throw err;
    }
  }

  /**
   * Carga la clave del perfil en memoria. Si todavía no existe (perfil de
   * Prompt 6 sin keyring), bootstrapea perezosamente: si llega masterPassword
   * crea modo wrapped; si no, modo safe-storage. Esto evita una migración
   * dedicada para perfiles legacy.
   */
  async unlockProfile(
    profileId: string,
    settings: ProfileSettingsRepository,
    masterPassword?: string,
  ): Promise<void> {
    await this.ensureSodiumReady();
    if (this.keysInMemory.has(profileId)) return;

    const mode = settings.get(SETTING_MODE) as KeyringMode | null;
    if (!mode) {
      await this.createKeyForProfile(profileId, settings, masterPassword);
      return;
    }

    if (mode === 'master-password') {
      if (!masterPassword) throw new MasterPasswordRequiredError(profileId);
      const key = this.unwrapWithPassword(profileId, settings, masterPassword);
      this.keysInMemory.set(profileId, key);
    } else if (mode === 'safe-storage') {
      const key = this.unwrapWithSafeStorage(settings);
      this.keysInMemory.set(profileId, key);
    } else {
      throw new InvariantViolationError(
        `[keyring] modo desconocido en settings_profile: ${String(mode)}`,
      );
    }
    this.ctx.logger.info(
      `[keyring] perfil desbloqueado: profile=${profileId} modo=${mode}`,
    );
  }

  /**
   * Borra la clave en memoria (zeriza el buffer). Idempotente.
   */
  lockProfile(profileId: string): void {
    const key = this.keysInMemory.get(profileId);
    if (!key) return;
    sodium.memzero(key);
    this.keysInMemory.delete(profileId);
    this.ctx.logger.info(`[keyring] perfil bloqueado: profile=${profileId}`);
  }

  lockAll(): void {
    for (const profileId of [...this.keysInMemory.keys()]) {
      this.lockProfile(profileId);
    }
  }

  /**
   * Cambia el modo de almacenamiento o la contraseña maestra. El perfil debe
   * estar desbloqueado.
   *
   *  - current=null,        next=string: pasa de safe-storage a master-password.
   *  - current=string,      next=null:   pasa de master-password a safe-storage.
   *  - current=string,      next=string: rota la KEK manteniendo el modo.
   *  - current=null,        next=null:   no-op.
   *
   * Para cambiar la contraseña, primero verifica `current` reabriendo la
   * envuelta; si falla, lanza InvalidMasterPasswordError.
   */
  async setMasterPassword(
    profileId: string,
    settings: ProfileSettingsRepository,
    current: string | null,
    nextPassword: string | null,
  ): Promise<void> {
    await this.ensureSodiumReady();
    const key = this.getKey(profileId); // exige perfil desbloqueado

    const currentMode = settings.get(SETTING_MODE) as KeyringMode | null;
    if (currentMode === 'master-password') {
      if (!current) {
        throw new InvariantViolationError(
          `setMasterPassword: el perfil ${profileId} tiene contraseña maestra; current no puede ser null`,
        );
      }
      // Verificación de la actual: descifrar la envuelta y comprobar que el
      // resultado coincide byte a byte con la clave en memoria. Si la
      // contraseña actual fuese incorrecta el desempaquetado tirará por la
      // verificación Poly1305.
      try {
        const verified = this.unwrapWithPassword(profileId, settings, current);
        if (!sodium.memcmp(verified, key)) {
          sodium.memzero(verified);
          throw new InvalidMasterPasswordError(profileId);
        }
        sodium.memzero(verified);
      } catch (err) {
        if (err instanceof InvalidMasterPasswordError) throw err;
        throw new InvalidMasterPasswordError(profileId);
      }
    }

    if (nextPassword) {
      this.clearSafeStorageMode(settings);
      this.persistMasterPasswordMode(settings, key, nextPassword);
    } else {
      this.clearMasterPasswordMode(settings);
      this.persistSafeStorageMode(settings, key);
    }
  }

  // ---- helpers internos ----------------------------------------------------

  private deriveKek(password: string, salt: Uint8Array): Uint8Array {
    return sodium.crypto_pwhash(
      KEY_LEN,
      password,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_ARGON2ID13,
    );
  }

  private persistMasterPasswordMode(
    settings: ProfileSettingsRepository,
    key: Uint8Array,
    password: string,
  ): void {
    const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
    const kek = this.deriveKek(password, salt);
    try {
      const nonce = sodium.randombytes_buf(
        sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES,
      );
      const wrapped = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        key,
        null,
        null,
        nonce,
        kek,
      );
      settings.set(SETTING_MODE, 'master-password');
      settings.set(SETTING_SALT, toB64(salt));
      settings.set(SETTING_NONCE, toB64(nonce));
      settings.set(SETTING_WRAPPED_KEY, toB64(wrapped));
    } finally {
      sodium.memzero(kek);
    }
  }

  private persistSafeStorageMode(
    settings: ProfileSettingsRepository,
    key: Uint8Array,
  ): void {
    if (!this.ctx.safeStorage.isEncryptionAvailable()) {
      throw new SafeStorageUnavailableError();
    }
    const blob = this.ctx.safeStorage.encryptString(toB64(key));
    settings.set(SETTING_MODE, 'safe-storage');
    settings.set(SETTING_SAFE_STORAGE_BLOB, blob.toString('base64'));
  }

  private clearMasterPasswordMode(settings: ProfileSettingsRepository): void {
    settings.delete(SETTING_WRAPPED_KEY);
    settings.delete(SETTING_SALT);
    settings.delete(SETTING_NONCE);
  }

  private clearSafeStorageMode(settings: ProfileSettingsRepository): void {
    settings.delete(SETTING_SAFE_STORAGE_BLOB);
  }

  private unwrapWithPassword(
    profileId: string,
    settings: ProfileSettingsRepository,
    password: string,
  ): Uint8Array {
    const saltB64 = settings.get(SETTING_SALT);
    const nonceB64 = settings.get(SETTING_NONCE);
    const wrappedB64 = settings.get(SETTING_WRAPPED_KEY);
    if (!saltB64 || !nonceB64 || !wrappedB64) {
      throw new InvariantViolationError(
        `[keyring] datos incompletos para profile=${profileId} en modo master-password`,
      );
    }
    const kek = this.deriveKek(password, fromB64(saltB64));
    try {
      try {
        return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          fromB64(wrappedB64),
          null,
          fromB64(nonceB64),
          kek,
        );
      } catch {
        throw new InvalidMasterPasswordError(profileId);
      }
    } finally {
      sodium.memzero(kek);
    }
  }

  private unwrapWithSafeStorage(
    settings: ProfileSettingsRepository,
  ): Uint8Array {
    if (!this.ctx.safeStorage.isEncryptionAvailable()) {
      throw new SafeStorageUnavailableError();
    }
    const blobB64 = settings.get(SETTING_SAFE_STORAGE_BLOB);
    if (!blobB64) {
      throw new InvariantViolationError(
        '[keyring] safe-storage blob ausente en settings_profile',
      );
    }
    const keyB64 = this.ctx.safeStorage.decryptString(
      Buffer.from(blobB64, 'base64'),
    );
    return fromB64(keyB64);
  }
}

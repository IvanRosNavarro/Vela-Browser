import sodium from 'libsodium-wrappers-sumo';
import type { VaultSnapshotItem } from '../passwords/vaultSnapshot';

/**
 * Formato v2 del blob del vault que viaja por sincronización.
 *
 * Hasta v0.2.9 el blob era un array JSON con las entradas **en claro** dentro,
 * protegido solo por el cifrado de transporte con la clave de sync. Esa clave
 * cubre también workspaces y ajustes y se guarda en el equipo envuelta con
 * `safeStorage` para poder reconectar sin preguntar nada: quien llegase al
 * perfil desbloqueado llegaba a las credenciales.
 *
 * En v2 cada entrada va cifrada por separado con una clave propia del vault,
 * derivada con Argon2id de una passphrase que el usuario teclea en cada
 * dispositivo y que **solo vive en memoria**. El sobre exterior se sigue
 * cifrando con la clave de sync, así que el servidor tampoco ve los ids ni las
 * marcas de tiempo; la diferencia es que ahora ni la clave de sync ni el disco
 * del equipo bastan para abrir una contraseña.
 *
 * Cada entrada lleva como AAD su propio id, el id del perfil remoto y la
 * versión: un ciphertext no se puede recolocar en otra entrada, en otro perfil
 * ni degradar a un formato anterior sin que la autenticación falle.
 */

export const VAULT_SYNC_VERSION = 2 as const;

const AAD_PREFIX = 'vela-vault-v2';
const CHECK_PLAINTEXT = 'vela-vault-check';
const CHECK_SLOT = '\u0000check';
const NONCE_LEN = 24; // crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
const KEY_LEN = 32;

export interface VaultSyncKdf {
  alg: 'argon2id';
  /** base64 */
  salt: string;
  ops: number;
  mem: number;
}

export interface VaultSyncEnvelopeItem {
  id: string;
  /** En claro dentro del sobre para poder fusionar por LWW sin descifrar. */
  updatedAt: number;
  /** base64 de `nonce(24) || ciphertext+tag`. */
  ct: string;
}

export interface VaultSyncEnvelope {
  v: typeof VAULT_SYNC_VERSION;
  kdf: VaultSyncKdf;
  /** Verificador: permite saber si la passphrase es correcta sin tocar datos. */
  check: string;
  items: VaultSyncEnvelopeItem[];
}

/** Hay que esperar a sodium antes de usar cualquier función de este módulo. */
export async function ensureSodium(): Promise<void> {
  await sodium.ready;
}

export function newVaultSyncKdf(): VaultSyncKdf {
  return {
    alg: 'argon2id',
    salt: sodium.to_base64(
      sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES),
      sodium.base64_variants.ORIGINAL,
    ),
    ops: sodium.crypto_pwhash_OPSLIMIT_MODERATE,
    mem: sodium.crypto_pwhash_MEMLIMIT_MODERATE,
  };
}

export function isVaultSyncKdf(value: unknown): value is VaultSyncKdf {
  if (!value || typeof value !== 'object') return false;
  const k = value as Partial<VaultSyncKdf>;
  return (
    k.alg === 'argon2id' &&
    typeof k.salt === 'string' &&
    typeof k.ops === 'number' &&
    typeof k.mem === 'number'
  );
}

export function deriveVaultSyncKey(passphrase: string, kdf: VaultSyncKdf): Uint8Array {
  if (!isVaultSyncKdf(kdf)) {
    throw new Error('[vault-sync] parámetros de derivación inválidos');
  }
  return sodium.crypto_pwhash(
    KEY_LEN,
    passphrase,
    sodium.from_base64(kdf.salt, sodium.base64_variants.ORIGINAL),
    kdf.ops,
    kdf.mem,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
}

function aad(remoteProfileId: string, slot: string): Uint8Array {
  return sodium.from_string(`${AAD_PREFIX}|${remoteProfileId}|${slot}`);
}

function seal(plaintext: string, key: Uint8Array, ad: Uint8Array): string {
  const nonce = sodium.randombytes_buf(NONCE_LEN);
  const ct = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    sodium.from_string(plaintext),
    ad,
    null,
    nonce,
    key,
  );
  const packed = new Uint8Array(nonce.length + ct.length);
  packed.set(nonce, 0);
  packed.set(ct, nonce.length);
  return sodium.to_base64(packed, sodium.base64_variants.ORIGINAL);
}

function open(packedB64: string, key: Uint8Array, ad: Uint8Array): string {
  const packed = sodium.from_base64(packedB64, sodium.base64_variants.ORIGINAL);
  if (packed.length <= NONCE_LEN) {
    throw new Error('[vault-sync] ciphertext inválido');
  }
  const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    packed.subarray(NONCE_LEN),
    ad,
    packed.subarray(0, NONCE_LEN),
    key,
  );
  return sodium.to_string(plain);
}

export function makeCheck(key: Uint8Array, remoteProfileId: string): string {
  return seal(CHECK_PLAINTEXT, key, aad(remoteProfileId, CHECK_SLOT));
}

/** ¿Abre esta clave el vault? No revela nada del contenido. */
export function verifyCheck(check: string, key: Uint8Array, remoteProfileId: string): boolean {
  try {
    return open(check, key, aad(remoteProfileId, CHECK_SLOT)) === CHECK_PLAINTEXT;
  } catch {
    return false;
  }
}

export function sealVaultSnapshot(
  items: readonly VaultSnapshotItem[],
  key: Uint8Array,
  kdf: VaultSyncKdf,
  remoteProfileId: string,
): VaultSyncEnvelope {
  return {
    v: VAULT_SYNC_VERSION,
    kdf,
    check: makeCheck(key, remoteProfileId),
    items: items.map((item) => ({
      id: item.id,
      updatedAt: item.updatedAt,
      ct: seal(JSON.stringify(item), key, aad(remoteProfileId, item.id)),
    })),
  };
}

export interface OpenedVaultEnvelope {
  items: VaultSnapshotItem[];
  /** Ids que no se pudieron abrir (aptos para log: no llevan datos). */
  failed: string[];
}

/**
 * Abre el sobre entrada a entrada. Una entrada corrupta o manipulada se
 * descarta sin arrastrar a las demás, igual que hace `applyVaultSnapshot`.
 */
export function openVaultEnvelope(
  envelope: VaultSyncEnvelope,
  key: Uint8Array,
  remoteProfileId: string,
): OpenedVaultEnvelope {
  const result: OpenedVaultEnvelope = { items: [], failed: [] };
  for (const entry of envelope.items) {
    try {
      const json = open(entry.ct, key, aad(remoteProfileId, entry.id));
      const item = JSON.parse(json) as VaultSnapshotItem;
      // El id va autenticado como AAD, pero el del cuerpo podría diferir: se
      // impone el del sobre para que no se pueda pisar otra entrada.
      if (item.id !== entry.id) {
        result.failed.push(entry.id);
        continue;
      }
      result.items.push(item);
    } catch {
      result.failed.push(entry.id);
    }
  }
  return result;
}

export function isVaultSyncEnvelope(value: unknown): value is VaultSyncEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const env = value as Partial<VaultSyncEnvelope>;
  return (
    env.v === VAULT_SYNC_VERSION &&
    isVaultSyncKdf(env.kdf) &&
    typeof env.check === 'string' &&
    Array.isArray(env.items)
  );
}

/** Borra una clave de memoria en cuanto deja de hacer falta. */
export function zeroKey(key: Uint8Array | null): void {
  if (key) sodium.memzero(key);
}

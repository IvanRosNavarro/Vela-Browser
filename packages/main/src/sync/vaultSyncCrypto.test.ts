import { describe, expect, it, beforeAll } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import type { VaultSnapshotItem } from '../passwords/vaultSnapshot';
import {
  deriveVaultSyncKey,
  isVaultSyncEnvelope,
  makeCheck,
  newVaultSyncKdf,
  openVaultEnvelope,
  sealVaultSnapshot,
  verifyCheck,
  type VaultSyncKdf,
} from './vaultSyncCrypto';

const PROFILE = 'perfil-remoto-1';

// Argon2id con los parámetros de producción (MODERATE) tarda cientos de ms por
// derivación, y en una máquina cargada se comió el límite de 5 s de vitest. Lo
// que estos tests ejercitan es el formato, no el coste del KDF, así que derivan
// con los parámetros mínimos; que producción use MODERATE lo comprueba el
// último test.
let kdf: VaultSyncKdf;
let key: Uint8Array;

function cheapKdf(): VaultSyncKdf {
  return {
    ...newVaultSyncKdf(),
    ops: sodium.crypto_pwhash_OPSLIMIT_MIN,
    mem: sodium.crypto_pwhash_MEMLIMIT_MIN,
  };
}

const password = (id: string, domain: string): VaultSnapshotItem =>
  ({
    id,
    domain,
    username: 'ana',
    password: 's3cr3t',
    loginUrl: null,
    notes: null,
    folder: 'General',
    createdAt: 1,
    updatedAt: 2,
    lastUsedAt: null,
  }) as unknown as VaultSnapshotItem;

beforeAll(async () => {
  await sodium.ready;
  kdf = cheapKdf();
  key = deriveVaultSyncKey('contraseña del vault', kdf);
});

describe('vaultSyncCrypto', () => {
  it('sella y abre el snapshot completo', () => {
    const items = [password('a', 'example.com'), password('b', 'otra.com')];
    const envelope = sealVaultSnapshot(items, key, kdf, PROFILE);

    expect(isVaultSyncEnvelope(envelope)).toBe(true);
    expect(envelope.items.map((i) => i.id)).toEqual(['a', 'b']);

    const opened = openVaultEnvelope(envelope, key, PROFILE);
    expect(opened.failed).toEqual([]);
    expect(opened.items).toEqual(items);
  });

  it('no deja las contraseñas legibles en el sobre', () => {
    const envelope = sealVaultSnapshot([password('a', 'example.com')], key, kdf, PROFILE);
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain('s3cr3t');
    expect(serialized).not.toContain('example.com');
    expect(serialized).not.toContain('ana');
    // El id y la fecha sí viajan en claro DENTRO del sobre: hacen falta para
    // fusionar por LWW sin descifrar. El sobre entero va cifrado con la clave
    // de sync antes de salir del equipo.
    expect(serialized).toContain('"a"');
  });

  it('otra passphrase no abre nada', async () => {
    const envelope = sealVaultSnapshot([password('a', 'example.com')], key, kdf, PROFILE);
    const otra = deriveVaultSyncKey('otra distinta', kdf);

    expect(verifyCheck(envelope.check, otra, PROFILE)).toBe(false);
    const opened = openVaultEnvelope(envelope, otra, PROFILE);
    expect(opened.items).toEqual([]);
    expect(opened.failed).toEqual(['a']);
  });

  it('el verificador acepta la passphrase correcta', () => {
    expect(verifyCheck(makeCheck(key, PROFILE), key, PROFILE)).toBe(true);
  });

  it('un sobre de otro perfil remoto no se abre aquí', () => {
    const envelope = sealVaultSnapshot([password('a', 'example.com')], key, kdf, PROFILE);
    const opened = openVaultEnvelope(envelope, key, 'otro-perfil');
    expect(opened.items).toEqual([]);
    expect(opened.failed).toEqual(['a']);
    expect(verifyCheck(envelope.check, key, 'otro-perfil')).toBe(false);
  });

  it('una entrada recolocada en el hueco de otra se rechaza', () => {
    const envelope = sealVaultSnapshot(
      [password('a', 'example.com'), password('b', 'otra.com')],
      key,
      kdf,
      PROFILE,
    );
    // El id va como AAD: mover el ciphertext de 'b' al hueco de 'a' rompe la
    // autenticación en vez de suplantar la entrada.
    envelope.items[0]!.ct = envelope.items[1]!.ct;

    const opened = openVaultEnvelope(envelope, key, PROFILE);
    expect(opened.failed).toContain('a');
    expect(opened.items.map((i) => i.id)).toEqual(['b']);
  });

  it('una entrada corrupta no arrastra a las demás', () => {
    const envelope = sealVaultSnapshot(
      [password('a', 'example.com'), password('b', 'otra.com')],
      key,
      kdf,
      PROFILE,
    );
    envelope.items[0]!.ct = 'no-es-base64-valido!!';

    const opened = openVaultEnvelope(envelope, key, PROFILE);
    expect(opened.failed).toEqual(['a']);
    expect(opened.items.map((i) => i.id)).toEqual(['b']);
  });

  it('la misma passphrase con otro salt da otra clave', () => {
    const otroKdf = cheapKdf();
    const otraKey = deriveVaultSyncKey('contraseña del vault', otroKdf);
    expect(Buffer.from(otraKey)).not.toEqual(Buffer.from(key));
  });

  it('en producción se derivan las claves con Argon2id MODERATE', () => {
    const real = newVaultSyncKdf();
    expect(real.alg).toBe('argon2id');
    expect(real.ops).toBe(sodium.crypto_pwhash_OPSLIMIT_MODERATE);
    expect(real.mem).toBe(sodium.crypto_pwhash_MEMLIMIT_MODERATE);
  });

  it('isVaultSyncEnvelope distingue el formato anterior', () => {
    expect(isVaultSyncEnvelope([{ id: 'a' }])).toBe(false);
    expect(isVaultSyncEnvelope(null)).toBe(false);
    expect(isVaultSyncEnvelope({ v: 1, items: [] })).toBe(false);
  });
});

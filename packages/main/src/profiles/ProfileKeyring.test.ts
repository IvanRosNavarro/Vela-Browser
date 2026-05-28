import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import sodium from 'libsodium-wrappers-sumo';
import { ProfileKeyring, type SafeStorageAdapter } from './ProfileKeyring';
import { ProfileSettingsRepository } from '../storage/repositories';
import {
  InvalidMasterPasswordError,
  MasterPasswordRequiredError,
} from './ProfileManager';

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

/**
 * Mock de safeStorage en memoria para tests. La cifra es un XOR sin
 * sentido criptográfico; basta para verificar que el keyring le pasa los
 * blobs correctos en cada modo.
 */
function buildMockSafeStorage(available = true): SafeStorageAdapter {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (s: string) => Buffer.from(`enc:${s}`, 'utf8'),
    decryptString: (b: Buffer) => {
      const s = b.toString('utf8');
      if (!s.startsWith('enc:')) throw new Error('mock decrypt');
      return s.slice(4);
    },
  };
}

function makeSettingsRepo(): {
  db: DatabaseSync;
  settings: ProfileSettingsRepository;
} {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE settings_profile (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )`);
  const settings = new ProfileSettingsRepository(db);
  return { db, settings };
}

describe('ProfileKeyring', () => {
  beforeEach(async () => {
    await sodium.ready;
  });

  it('createKeyForProfile sin master password usa safe-storage y deja la clave desbloqueada', async () => {
    const ss = buildMockSafeStorage();
    const kr = new ProfileKeyring({ logger: noopLogger, safeStorage: ss });
    const { settings } = makeSettingsRepo();

    await kr.createKeyForProfile('p1', settings);

    expect(kr.isUnlocked('p1')).toBe(true);
    expect(settings.get('keyring:mode')).toBe('safe-storage');
    expect(settings.get('keyring:safe-storage-blob')).not.toBeNull();
    expect(settings.get('keyring:wrapped-key')).toBeNull();
  });

  it('createKeyForProfile con master password usa modo wrapped y persiste salt+nonce', async () => {
    const ss = buildMockSafeStorage();
    const kr = new ProfileKeyring({ logger: noopLogger, safeStorage: ss });
    const { settings } = makeSettingsRepo();

    await kr.createKeyForProfile('p1', settings, 'correct horse battery staple');

    expect(settings.get('keyring:mode')).toBe('master-password');
    expect(settings.get('keyring:wrapped-key')).not.toBeNull();
    expect(settings.get('keyring:salt')).not.toBeNull();
    expect(settings.get('keyring:nonce')).not.toBeNull();
    expect(settings.get('keyring:safe-storage-blob')).toBeNull();
  });

  it('unlockProfile en safe-storage devuelve la misma clave que se creó', async () => {
    const ss = buildMockSafeStorage();
    const kr = new ProfileKeyring({ logger: noopLogger, safeStorage: ss });
    const { settings } = makeSettingsRepo();
    await kr.createKeyForProfile('p1', settings);
    const original = Buffer.from(kr.getKey('p1'));
    kr.lockProfile('p1');

    await kr.unlockProfile('p1', settings);
    expect(Buffer.from(kr.getKey('p1')).equals(original)).toBe(true);
  });

  it('unlockProfile con master password correcta recupera la clave', async () => {
    const ss = buildMockSafeStorage();
    const kr = new ProfileKeyring({ logger: noopLogger, safeStorage: ss });
    const { settings } = makeSettingsRepo();
    await kr.createKeyForProfile('p1', settings, 'pw1');
    const original = Buffer.from(kr.getKey('p1'));
    kr.lockProfile('p1');

    await kr.unlockProfile('p1', settings, 'pw1');
    expect(Buffer.from(kr.getKey('p1')).equals(original)).toBe(true);
  });

  it('unlockProfile con master password incorrecta lanza InvalidMasterPasswordError', async () => {
    const ss = buildMockSafeStorage();
    const kr = new ProfileKeyring({ logger: noopLogger, safeStorage: ss });
    const { settings } = makeSettingsRepo();
    await kr.createKeyForProfile('p1', settings, 'pw1');
    kr.lockProfile('p1');

    await expect(
      kr.unlockProfile('p1', settings, 'wrong-pw'),
    ).rejects.toBeInstanceOf(InvalidMasterPasswordError);
    expect(kr.isUnlocked('p1')).toBe(false);
  });

  it('unlockProfile sin master password en perfil con master lanza MasterPasswordRequiredError', async () => {
    const ss = buildMockSafeStorage();
    const kr = new ProfileKeyring({ logger: noopLogger, safeStorage: ss });
    const { settings } = makeSettingsRepo();
    await kr.createKeyForProfile('p1', settings, 'pw1');
    kr.lockProfile('p1');

    await expect(kr.unlockProfile('p1', settings)).rejects.toBeInstanceOf(
      MasterPasswordRequiredError,
    );
  });

  it('lockProfile zerifica la clave en memoria y getKey lanza ProfileLockedError', async () => {
    const ss = buildMockSafeStorage();
    const kr = new ProfileKeyring({ logger: noopLogger, safeStorage: ss });
    const { settings } = makeSettingsRepo();
    await kr.createKeyForProfile('p1', settings);

    const view = kr.getKey('p1');
    expect(view.some((b) => b !== 0)).toBe(true);
    kr.lockProfile('p1');
    // El buffer ha sido zerizado in-place — la vista anterior debería estar a cero.
    expect(view.every((b) => b === 0)).toBe(true);
    expect(() => kr.getKey('p1')).toThrowError(/locked/);
    expect(kr.isUnlocked('p1')).toBe(false);
  });

  it('cada perfil tiene clave independiente', async () => {
    const ss = buildMockSafeStorage();
    const kr = new ProfileKeyring({ logger: noopLogger, safeStorage: ss });
    const a = makeSettingsRepo();
    const b = makeSettingsRepo();

    await kr.createKeyForProfile('a', a.settings);
    await kr.createKeyForProfile('b', b.settings);

    const ka = Buffer.from(kr.getKey('a'));
    const kb = Buffer.from(kr.getKey('b'));
    expect(ka.equals(kb)).toBe(false);
  });

  it('setMasterPassword pasa de safe-storage a master-password (current=null)', async () => {
    const ss = buildMockSafeStorage();
    const kr = new ProfileKeyring({ logger: noopLogger, safeStorage: ss });
    const { settings } = makeSettingsRepo();
    await kr.createKeyForProfile('p1', settings);
    const original = Buffer.from(kr.getKey('p1'));

    await kr.setMasterPassword('p1', settings, null, 'new-pw');

    expect(settings.get('keyring:mode')).toBe('master-password');
    expect(settings.get('keyring:safe-storage-blob')).toBeNull();
    // Lock+unlock con la nueva contraseña debe recuperar la misma clave.
    kr.lockProfile('p1');
    await kr.unlockProfile('p1', settings, 'new-pw');
    expect(Buffer.from(kr.getKey('p1')).equals(original)).toBe(true);
  });

  it('setMasterPassword pasa de master-password a safe-storage (next=null)', async () => {
    const ss = buildMockSafeStorage();
    const kr = new ProfileKeyring({ logger: noopLogger, safeStorage: ss });
    const { settings } = makeSettingsRepo();
    await kr.createKeyForProfile('p1', settings, 'old-pw');
    const original = Buffer.from(kr.getKey('p1'));

    await kr.setMasterPassword('p1', settings, 'old-pw', null);

    expect(settings.get('keyring:mode')).toBe('safe-storage');
    expect(settings.get('keyring:wrapped-key')).toBeNull();
    expect(settings.get('keyring:salt')).toBeNull();
    expect(settings.get('keyring:nonce')).toBeNull();
    kr.lockProfile('p1');
    await kr.unlockProfile('p1', settings);
    expect(Buffer.from(kr.getKey('p1')).equals(original)).toBe(true);
  });

  it('setMasterPassword con current incorrecto lanza InvalidMasterPasswordError', async () => {
    const ss = buildMockSafeStorage();
    const kr = new ProfileKeyring({ logger: noopLogger, safeStorage: ss });
    const { settings } = makeSettingsRepo();
    await kr.createKeyForProfile('p1', settings, 'old-pw');

    await expect(
      kr.setMasterPassword('p1', settings, 'wrong', 'new-pw'),
    ).rejects.toBeInstanceOf(InvalidMasterPasswordError);
    // El modo no debe haber cambiado.
    expect(settings.get('keyring:mode')).toBe('master-password');
  });

  it('safeStorage no disponible obliga a usar contraseña maestra', async () => {
    const ss = buildMockSafeStorage(false);
    const kr = new ProfileKeyring({ logger: noopLogger, safeStorage: ss });
    const { settings } = makeSettingsRepo();
    await expect(kr.createKeyForProfile('p1', settings)).rejects.toThrowError(
      /safeStorage/,
    );
  });

  it('unlockProfile sin keyring previo bootstrapea perezosamente (perfil legacy)', async () => {
    const ss = buildMockSafeStorage();
    const kr = new ProfileKeyring({ logger: noopLogger, safeStorage: ss });
    const { settings } = makeSettingsRepo();
    // Sin createKeyForProfile previo: simula un perfil de Prompt 6.
    await kr.unlockProfile('legacy', settings);
    expect(kr.isUnlocked('legacy')).toBe(true);
    expect(settings.get('keyring:mode')).toBe('safe-storage');
  });
});

describe('ProfileKeyring vi.fn check', () => {
  it('encryptString/decryptString se invocan con strings (no buffers)', async () => {
    const enc = vi.fn((s: string) => Buffer.from(`x:${s}`));
    const dec = vi.fn((b: Buffer) => b.toString('utf8').slice(2));
    const ss: SafeStorageAdapter = {
      isEncryptionAvailable: () => true,
      encryptString: enc,
      decryptString: dec,
    };
    const kr = new ProfileKeyring({ logger: noopLogger, safeStorage: ss });
    const { settings } = makeSettingsRepo();
    await kr.createKeyForProfile('p1', settings);
    expect(enc).toHaveBeenCalledTimes(1);
    expect(typeof enc.mock.calls[0]?.[0]).toBe('string');
    kr.lockProfile('p1');
    await kr.unlockProfile('p1', settings);
    expect(dec).toHaveBeenCalledTimes(1);
    expect(Buffer.isBuffer(dec.mock.calls[0]?.[0])).toBe(true);
  });
});

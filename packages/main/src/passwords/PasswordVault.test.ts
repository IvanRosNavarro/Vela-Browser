import { describe, expect, it, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import sodium from 'libsodium-wrappers-sumo';
import { PasswordVault } from './PasswordVault';
import {
  ProfileKeyring,
  ProfileLockedError,
  type SafeStorageAdapter,
} from '../profiles/ProfileKeyring';
import { ProfileSettingsRepository } from '../storage/repositories';
import { NotFoundError } from '../lib/errors';

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

function buildMockSafeStorage(): SafeStorageAdapter {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`, 'utf8'),
    decryptString: (b: Buffer) => b.toString('utf8').slice(4),
  };
}

async function setupVault(): Promise<{
  vault: PasswordVault;
  keyring: ProfileKeyring;
  db: DatabaseSync;
  profileId: string;
}> {
  await sodium.ready;
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE settings_profile (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE password_vault (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    username TEXT NOT NULL,
    encrypted_password BLOB NOT NULL,
    notes_encrypted BLOB,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE INDEX idx_password_vault_domain ON password_vault(domain)`);
  const profileId = 'p1';
  const settings = new ProfileSettingsRepository(db);
  const keyring = new ProfileKeyring({
    logger: noopLogger,
    safeStorage: buildMockSafeStorage(),
  });
  await keyring.createKeyForProfile(profileId, settings);
  const vault = new PasswordVault({
    db,
    keyring,
    profileId,
    logger: noopLogger,
  });
  return { vault, keyring, db, profileId };
}

describe('PasswordVault', () => {
  let ctx: Awaited<ReturnType<typeof setupVault>>;

  beforeEach(async () => {
    ctx = await setupVault();
  });

  it('store + retrieve devuelve la entrada con la contraseña en claro', () => {
    const id = ctx.vault.store({
      domain: 'example.com',
      username: 'alice',
      password: 'hunter2',
    });
    const entry = ctx.vault.retrieve(id);
    expect(entry).not.toBeNull();
    expect(entry?.domain).toBe('example.com');
    expect(entry?.username).toBe('alice');
    expect(entry?.password).toBe('hunter2');
    expect(entry?.notes).toBeNull();
  });

  it('los blobs en BD son binarios y no contienen el plaintext', () => {
    ctx.vault.store({
      domain: 'example.com',
      username: 'alice',
      password: 'hunter2-very-unique-marker',
    });
    const row = ctx.db
      .prepare(
        'SELECT encrypted_password FROM password_vault WHERE domain = ?',
      )
      .get('example.com') as { encrypted_password: Uint8Array };
    const asString = Buffer.from(row.encrypted_password).toString('utf8');
    expect(asString).not.toContain('hunter2');
    expect(row.encrypted_password.length).toBeGreaterThan(24);
  });

  it('retrieve devuelve null para id inexistente', () => {
    expect(ctx.vault.retrieve('nope')).toBeNull();
  });

  it('listForDomain devuelve summary sin descifrar', () => {
    const id1 = ctx.vault.store({
      domain: 'example.com',
      username: 'alice',
      password: 'p1',
    });
    const id2 = ctx.vault.store({
      domain: 'example.com',
      username: 'bob',
      password: 'p2',
    });
    ctx.vault.store({
      domain: 'other.com',
      username: 'carol',
      password: 'p3',
    });

    const list = ctx.vault.listForDomain('example.com');
    expect(list.map((e) => e.id).sort()).toEqual([id1, id2].sort());
    // Verificamos que el summary no contenga el campo `password`.
    expect(list.every((e) => !('password' in e))).toBe(true);
  });

  it('store con notes los cifra y retrieve los devuelve', () => {
    const id = ctx.vault.store({
      domain: 'a',
      username: 'u',
      password: 'p',
      notes: 'la nota secreta',
    });
    const entry = ctx.vault.retrieve(id);
    expect(entry?.notes).toBe('la nota secreta');
  });

  it('update modifica solo los campos provistos', async () => {
    const id = ctx.vault.store({
      domain: 'a.com',
      username: 'alice',
      password: 'old',
    });
    await new Promise((r) => setTimeout(r, 5));
    const before = ctx.vault.retrieve(id)!;
    const updated = ctx.vault.update(id, { password: 'new' });
    expect(updated.password).toBe('new');
    expect(updated.username).toBe('alice');
    expect(updated.domain).toBe('a.com');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before.updatedAt);
  });

  it('update con id inexistente lanza NotFoundError', () => {
    expect(() => ctx.vault.update('nope', { password: 'x' })).toThrow(
      NotFoundError,
    );
  });

  it('delete elimina la entrada', () => {
    const id = ctx.vault.store({ domain: 'a', username: 'u', password: 'p' });
    ctx.vault.delete(id);
    expect(ctx.vault.retrieve(id)).toBeNull();
  });

  it('delete con id inexistente lanza NotFoundError', () => {
    expect(() => ctx.vault.delete('nope')).toThrow(NotFoundError);
  });

  it('store/retrieve fallan si el perfil está bloqueado', () => {
    const id = ctx.vault.store({
      domain: 'a',
      username: 'u',
      password: 'p',
    });
    ctx.keyring.lockProfile(ctx.profileId);
    expect(() => ctx.vault.retrieve(id)).toThrow(ProfileLockedError);
    expect(() =>
      ctx.vault.store({ domain: 'b', username: 'u', password: 'p' }),
    ).toThrow(ProfileLockedError);
  });

  it('cifrados sucesivos del mismo plaintext producen blobs distintos (nonce aleatorio)', () => {
    const id1 = ctx.vault.store({ domain: 'a', username: 'u', password: 'p' });
    const id2 = ctx.vault.store({ domain: 'a', username: 'u', password: 'p' });
    const r1 = ctx.db
      .prepare('SELECT encrypted_password FROM password_vault WHERE id = ?')
      .get(id1) as { encrypted_password: Uint8Array };
    const r2 = ctx.db
      .prepare('SELECT encrypted_password FROM password_vault WHERE id = ?')
      .get(id2) as { encrypted_password: Uint8Array };
    expect(Buffer.from(r1.encrypted_password).equals(r2.encrypted_password)).toBe(false);
  });
});

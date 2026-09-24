import { describe, expect, it, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import sodium from 'libsodium-wrappers-sumo';
import { EMPTY_ADDRESS, type AddressData, type CardData } from '@vela/shared';
import { AutofillVault } from './AutofillVault';
import { PasswordVault } from './PasswordVault';
import { applyVaultSnapshot, buildVaultSnapshot } from './vaultSnapshot';
import { VaultTombstoneRepository } from './vaultTombstones';
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

const MIGRATION = fs.readFileSync(
  path.join(__dirname, '../storage/profile-migrations/021-vault-addresses-cards.sql'),
  'utf8',
);

async function setup() {
  await sodium.ready;
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE settings_profile (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at INTEGER
  )`);
  db.exec(`CREATE TABLE password_vault (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    username TEXT NOT NULL,
    encrypted_password BLOB NOT NULL,
    notes_encrypted BLOB,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    folder TEXT NOT NULL DEFAULT 'General',
    login_url TEXT,
    last_used_at INTEGER
  )`);
  db.exec(`CREATE TABLE vault_tombstones (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    deleted_at INTEGER NOT NULL
  )`);
  db.exec(MIGRATION);
  const profileId = 'p1';
  const settings = new ProfileSettingsRepository(db);
  const keyring = new ProfileKeyring({ logger: noopLogger, safeStorage: buildMockSafeStorage() });
  await keyring.createKeyForProfile(profileId, settings);
  const ctx = { db, keyring, profileId, logger: noopLogger };
  return {
    db,
    keyring,
    profileId,
    autofill: new AutofillVault(ctx),
    passwords: new PasswordVault(ctx),
  };
}

const HOME: AddressData = {
  ...EMPTY_ADDRESS,
  label: 'Casa',
  fullName: 'Ana García López',
  addressLine1: 'Calle Mayor 1',
  addressLine2: '3º B',
  city: 'Madrid',
  postalCode: '28013',
  region: 'Madrid',
  country: 'España',
  phone: '+34 600 000 000',
  email: 'ana@example.com',
};

const VISA: CardData = {
  holderName: 'ANA GARCIA',
  number: '4111 1111 1111 1111',
  expMonth: 7,
  expYear: 2029,
  alias: 'Personal',
};

describe('AutofillVault', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });

  it('guarda y recupera direcciones', () => {
    const saved = ctx.autofill.saveAddress(HOME);
    expect(saved.id).toBeTruthy();
    expect(ctx.autofill.getAddress(saved.id)).toMatchObject(HOME);
    expect(ctx.autofill.listAddresses()).toHaveLength(1);
  });

  it('cifra el contenido en disco: nada de datos personales en claro', () => {
    ctx.autofill.saveAddress(HOME);
    ctx.autofill.saveCard(VISA);
    for (const table of ['vault_addresses', 'vault_cards']) {
      const rows = ctx.db.prepare(`SELECT data_encrypted FROM ${table}`).all() as Array<{ data_encrypted: Uint8Array }>;
      for (const row of rows) {
        const raw = Buffer.from(row.data_encrypted).toString('latin1');
        for (const needle of ['Calle Mayor', 'Ana', '28013', '4111111111111111', 'ANA GARCIA']) {
          expect(raw).not.toContain(needle);
        }
      }
    }
  });

  it('cada cifrado usa un nonce distinto', () => {
    const a = ctx.autofill.saveAddress(HOME);
    const b = ctx.autofill.saveAddress(HOME);
    const blobs = ctx.db
      .prepare('SELECT data_encrypted FROM vault_addresses WHERE id IN (?, ?)')
      .all(a.id, b.id) as Array<{ data_encrypted: Uint8Array }>;
    expect(Buffer.from(blobs[0]!.data_encrypted).equals(Buffer.from(blobs[1]!.data_encrypted))).toBe(false);
  });

  it('actualiza y elimina direcciones', () => {
    const saved = ctx.autofill.saveAddress(HOME);
    const updated = ctx.autofill.saveAddress({ ...HOME, city: 'Toledo' }, saved.id);
    expect(updated.city).toBe('Toledo');
    expect(updated.createdAt).toBe(saved.createdAt);
    ctx.autofill.deleteAddress(saved.id);
    expect(ctx.autofill.getAddress(saved.id)).toBeNull();
    expect(() => ctx.autofill.deleteAddress(saved.id)).toThrow(NotFoundError);
    expect(() => ctx.autofill.saveAddress(HOME, 'no-existe')).toThrow(NotFoundError);
  });

  it('normaliza el número de tarjeta y resume sin el número completo', () => {
    const saved = ctx.autofill.saveCard(VISA);
    expect(saved.number).toBe('4111111111111111');
    const [summary] = ctx.autofill.listCardSummaries();
    expect(summary).toMatchObject({ brand: 'visa', last4: '1111', expMonth: 7, expYear: 2029, alias: 'Personal' });
    expect(JSON.stringify(summary)).not.toContain('4111111111111111');
  });

  it('rechaza tarjetas con número imposible', () => {
    expect(() => ctx.autofill.saveCard({ ...VISA, number: '1234' })).toThrow();
  });

  it('la tarjeta no admite CVV: un campo extra no llega a guardarse', () => {
    const saved = ctx.autofill.saveCard({ ...VISA, cvv: '123' } as CardData);
    expect(saved).not.toHaveProperty('cvv');
    expect(JSON.stringify(ctx.autofill.getCard(saved.id))).not.toContain('123"');
  });

  it('encuentra duplicados de dirección y de tarjeta', () => {
    ctx.autofill.saveAddress(HOME);
    ctx.autofill.saveCard(VISA);
    expect(ctx.autofill.findSameAddress({ ...EMPTY_ADDRESS, addressLine1: 'calle mayor, 1', postalCode: '28013', city: 'MADRID' })).not.toBeNull();
    expect(ctx.autofill.findSameAddress({ ...HOME, postalCode: '28014' })).toBeNull();
    expect(ctx.autofill.findSameCard('4111-1111-1111-1111')).not.toBeNull();
    expect(ctx.autofill.findSameCard('5555555555554444')).toBeNull();
  });

  it('con el perfil bloqueado no lee ni escribe', () => {
    ctx.autofill.saveAddress(HOME);
    ctx.keyring.lockProfile(ctx.profileId);
    expect(() => ctx.autofill.listAddresses()).toThrow(ProfileLockedError);
    expect(() => ctx.autofill.saveCard(VISA)).toThrow(ProfileLockedError);
  });

  it('syncUpsert aplica last-write-wins', () => {
    const saved = ctx.autofill.saveAddress(HOME);
    ctx.autofill.syncUpsertAddress({ ...saved, city: 'Antigua', updatedAt: saved.updatedAt - 1000 });
    expect(ctx.autofill.getAddress(saved.id)!.city).toBe('Madrid');
    ctx.autofill.syncUpsertAddress({ ...saved, city: 'Nueva', updatedAt: saved.updatedAt + 1000 });
    expect(ctx.autofill.getAddress(saved.id)!.city).toBe('Nueva');
  });
});

describe('snapshot del vault para sync', () => {
  it('ida y vuelta: contraseñas, direcciones y tarjetas llegan a otro dispositivo', async () => {
    const origin = await setup();
    origin.passwords.store({ domain: 'example.com', username: 'ana', password: 's3cr3t' });
    origin.autofill.saveAddress(HOME);
    origin.autofill.saveCard(VISA);
    const items = buildVaultSnapshot(origin.passwords.exportAll(), origin.autofill.exportAll());
    // Sigue siendo un array, como esperan las versiones anteriores.
    expect(Array.isArray(items)).toBe(true);

    const target = await setup();
    const blob = JSON.parse(JSON.stringify(items)) as unknown;
    const result = applyVaultSnapshot(blob, { passwordVault: target.passwords, autofillVault: target.autofill });
    expect(result.rejected).toEqual([]);
    expect(target.passwords.exportAll()).toHaveLength(1);
    expect(target.autofill.listAddresses()[0]).toMatchObject(HOME);
    expect(target.autofill.listCards()[0]).toMatchObject({ number: '4111111111111111', expMonth: 7, expYear: 2029 });
  });

  it('el borrado viaja: la lápida quita la entrada en el otro dispositivo', async () => {
    const origin = await setup();
    const id = origin.passwords.store({ domain: 'example.com', username: 'ana', password: 's3cr3t' });
    const target = await setup();

    // El otro dispositivo ya la tenía.
    applyVaultSnapshot(
      JSON.parse(JSON.stringify(buildVaultSnapshot(origin.passwords.exportAll(), origin.autofill.exportAll()))),
      { passwordVault: target.passwords, autofillVault: target.autofill },
    );
    expect(target.passwords.exportAll()).toHaveLength(1);

    origin.passwords.delete(id);
    const originTombstones = new VaultTombstoneRepository(origin.db);
    const items = buildVaultSnapshot(
      origin.passwords.exportAll(),
      origin.autofill.exportAll(),
      originTombstones.list(),
    );

    applyVaultSnapshot(JSON.parse(JSON.stringify(items)), {
      passwordVault: target.passwords,
      autofillVault: target.autofill,
      vaultTombstones: new VaultTombstoneRepository(target.db),
    });
    expect(target.passwords.exportAll()).toEqual([]);
  });

  it('sin repositorio de lápidas el borrado se ignora en vez de aplicarse a ciegas', async () => {
    const origin = await setup();
    const id = origin.passwords.store({ domain: 'example.com', username: 'ana', password: 's3cr3t' });
    origin.passwords.delete(id);
    const items = buildVaultSnapshot(
      origin.passwords.exportAll(),
      origin.autofill.exportAll(),
      new VaultTombstoneRepository(origin.db).list(),
    );

    const target = await setup();
    const result = applyVaultSnapshot(JSON.parse(JSON.stringify(items)), {
      passwordVault: target.passwords,
      autofillVault: target.autofill,
    });
    expect(result.rejected).toEqual([]);
  });

  it('acepta el formato antiguo (solo contraseñas)', async () => {
    const origin = await setup();
    origin.passwords.store({ domain: 'example.com', username: 'ana', password: 's3cr3t' });
    const oldBlob = JSON.parse(JSON.stringify(origin.passwords.exportAll())) as unknown;
    const target = await setup();
    applyVaultSnapshot(oldBlob, { passwordVault: target.passwords, autofillVault: target.autofill });
    expect(target.passwords.exportAll()).toHaveLength(1);
    expect(target.autofill.listAddresses()).toHaveLength(0);
  });

  it('una versión anterior descarta direcciones y tarjetas sin romper las contraseñas', async () => {
    const origin = await setup();
    origin.passwords.store({ domain: 'example.com', username: 'ana', password: 's3cr3t' });
    origin.autofill.saveAddress(HOME);
    origin.autofill.saveCard(VISA);
    const items = JSON.parse(JSON.stringify(buildVaultSnapshot(origin.passwords.exportAll(), origin.autofill.exportAll()))) as unknown[];

    // Lo que hace pullVaultSnapshot en versiones anteriores: syncUpsert de
    // cada elemento como contraseña, con try/catch por entrada.
    const old = await setup();
    let rejected = 0;
    for (const entry of items) {
      try {
        old.passwords.syncUpsert(entry as Parameters<PasswordVault['syncUpsert']>[0]);
      } catch {
        rejected++;
      }
    }
    expect(rejected).toBe(2);
    const rows = old.db.prepare('SELECT domain, username FROM password_vault').all();
    expect(rows).toEqual([{ domain: 'example.com', username: 'ana' }]);
  });

  it('ignora elementos de tipos futuros', async () => {
    const target = await setup();
    const result = applyVaultSnapshot([{ kind: 'passkey', id: 'x' }], { passwordVault: target.passwords, autofillVault: target.autofill });
    expect(result).toEqual({ applied: 0, rejected: [] });
  });
});

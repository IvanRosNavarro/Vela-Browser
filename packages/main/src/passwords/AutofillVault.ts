import type { DatabaseSync } from 'node:sqlite';
import {
  addressDataSchema,
  cardDataSchema,
  cardLast4,
  detectCardBrand,
  normalizeCardNumber,
  type AddressData,
  type CardData,
  type VaultAddress,
  type VaultCard,
  type VaultCardSummary,
} from '@vela/shared';
import type { ProfileKeyring } from '../profiles/ProfileKeyring';
import type { Logger } from '../logger';
import { NotFoundError } from '../lib/errors';
import { decryptVaultString, encryptVaultString } from './vaultCrypto';
import { syncEvents } from '../sync/syncEvents';
import { recordTombstone, type VaultTombstoneKind } from './vaultTombstones';

interface EntryRow {
  id: string;
  data_encrypted: Uint8Array;
  created_at: number;
  updated_at: number;
  last_used_at: number | null;
}

interface EntryMeta {
  id: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

type Table = 'vault_addresses' | 'vault_cards';

// TODO(deuda): UUID v7 cuando esté disponible nativamente en el runtime.
function newId(): string {
  return globalThis.crypto.randomUUID();
}

const TOMBSTONE_KIND: Record<Table, VaultTombstoneKind> = {
  vault_addresses: 'address',
  vault_cards: 'card',
};

function normKey(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Valida y completa una dirección (datos que llegan descifrados o por sync). */
function toAddressData(raw: unknown): AddressData {
  const parsed = addressDataSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : addressDataSchema.parse({});
}

function toCardData(raw: unknown): CardData | null {
  const parsed = cardDataSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : null;
}

/**
 * Direcciones y tarjetas del vault de un perfil. Cada entrada se guarda como
 * JSON cifrado con la clave del perfil (misma clave y formato que las
 * contraseñas); solo ids y marcas de tiempo quedan en claro. Todas las
 * operaciones que leen o escriben contenido requieren el perfil desbloqueado:
 * `keyring.getKey` lanza `ProfileLockedError` si no lo está.
 */
export class AutofillVault {
  constructor(
    private readonly ctx: {
      db: DatabaseSync;
      keyring: ProfileKeyring;
      profileId: string;
      logger: Logger;
    },
  ) {}

  // ── Direcciones ───────────────────────────────────────────────────────────

  listAddresses(): VaultAddress[] {
    return this.readAll('vault_addresses').map(({ meta, json }) => ({ ...toAddressData(json), ...meta }));
  }

  getAddress(id: string): VaultAddress | null {
    const entry = this.readOne('vault_addresses', id);
    return entry ? { ...toAddressData(entry.json), ...entry.meta } : null;
  }

  /** Crea (sin id) o actualiza (con id) una dirección. */
  saveAddress(input: AddressData, id?: string): VaultAddress {
    const data = toAddressData(input);
    const savedId = this.write('vault_addresses', data, id);
    const saved = this.getAddress(savedId);
    if (!saved) throw new NotFoundError('VaultAddress', savedId);
    return saved;
  }

  deleteAddress(id: string): void {
    this.remove('vault_addresses', id, 'VaultAddress');
  }

  markAddressUsed(id: string): void {
    this.touch('vault_addresses', id);
  }

  /** Dirección ya guardada con la misma calle, código postal y ciudad. */
  findSameAddress(data: AddressData): VaultAddress | null {
    const key = (a: AddressData): string =>
      [a.addressLine1, a.postalCode, a.city].map(normKey).join('|');
    const wanted = key(data);
    return this.listAddresses().find((a) => key(a) === wanted) ?? null;
  }

  // ── Tarjetas ──────────────────────────────────────────────────────────────

  listCards(): VaultCard[] {
    const out: VaultCard[] = [];
    for (const { meta, json } of this.readAll('vault_cards')) {
      const data = toCardData(json);
      if (data) out.push({ ...data, ...meta });
    }
    return out;
  }

  /** Lo que la interfaz necesita para listar: sin el número completo. */
  listCardSummaries(): VaultCardSummary[] {
    return this.listCards().map((c) => toCardSummary(c));
  }

  getCard(id: string): VaultCard | null {
    const entry = this.readOne('vault_cards', id);
    if (!entry) return null;
    const data = toCardData(entry.json);
    return data ? { ...data, ...entry.meta } : null;
  }

  /** Crea (sin id) o actualiza (con id) una tarjeta. */
  saveCard(input: CardData, id?: string): VaultCard {
    const data = toCardData(input);
    if (!data) throw new TypeError('[autofill-vault] tarjeta inválida');
    const savedId = this.write('vault_cards', data, id);
    const saved = this.getCard(savedId);
    if (!saved) throw new NotFoundError('VaultCard', savedId);
    return saved;
  }

  deleteCard(id: string): void {
    this.remove('vault_cards', id, 'VaultCard');
  }

  markCardUsed(id: string): void {
    this.touch('vault_cards', id);
  }

  findSameCard(number: string): VaultCard | null {
    const digits = normalizeCardNumber(number);
    return this.listCards().find((c) => c.number === digits) ?? null;
  }

  // ── Sincronización ────────────────────────────────────────────────────────

  exportAll(): { addresses: VaultAddress[]; cards: VaultCard[] } {
    return { addresses: this.listAddresses(), cards: this.listCards() };
  }

  /**
   * Inserta o actualiza una entrada llegada por sync conservando id y
   * timestamps. Last-write-wins por `updatedAt`, como `PasswordVault`.
   */
  syncUpsertAddress(entry: VaultAddress): void {
    this.syncUpsert('vault_addresses', entry, toAddressData(entry));
  }

  syncUpsertCard(entry: VaultCard): void {
    const data = toCardData(entry);
    if (!data) throw new TypeError('[autofill-vault] tarjeta inválida en sync');
    this.syncUpsert('vault_cards', entry, data);
  }

  latestUpdatedAt(): number {
    const row = this.ctx.db
      .prepare(
        `SELECT MAX(m) AS m FROM (
           SELECT MAX(updated_at) AS m FROM vault_addresses
           UNION ALL
           SELECT MAX(updated_at) AS m FROM vault_cards
         )`,
      )
      .get() as { m: number | null } | undefined;
    return row?.m ?? 0;
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  private key(): Uint8Array {
    return this.ctx.keyring.getKey(this.ctx.profileId);
  }

  private decode(row: EntryRow, key: Uint8Array): { meta: EntryMeta; json: unknown } {
    let json: unknown = null;
    try {
      json = JSON.parse(decryptVaultString(row.data_encrypted, key));
    } catch {
      // Un BLOB corrupto no debe tumbar el listado entero. Sin datos
      // personales en el log: solo el id.
      this.ctx.logger.warn(`[autofill-vault] entrada ilegible: ${row.id}`);
    }
    return {
      meta: {
        id: row.id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastUsedAt: row.last_used_at,
      },
      json,
    };
  }

  private readAll(table: Table): Array<{ meta: EntryMeta; json: unknown }> {
    const key = this.key();
    const rows = this.ctx.db
      .prepare(
        `SELECT id, data_encrypted, created_at, updated_at, last_used_at FROM ${table}
         ORDER BY last_used_at DESC NULLS LAST, updated_at DESC`,
      )
      .all() as unknown as EntryRow[];
    return rows.map((r) => this.decode(r, key)).filter((e) => e.json !== null);
  }

  private readOne(table: Table, id: string): { meta: EntryMeta; json: unknown } | null {
    const key = this.key();
    const row = this.ctx.db
      .prepare(`SELECT id, data_encrypted, created_at, updated_at, last_used_at FROM ${table} WHERE id = ?`)
      .get(id) as unknown as EntryRow | undefined;
    if (!row) return null;
    const entry = this.decode(row, key);
    return entry.json === null ? null : entry;
  }

  private write(table: Table, data: object, id?: string): string {
    const blob = encryptVaultString(JSON.stringify(data), this.key());
    const now = Date.now();
    if (id) {
      const result = this.ctx.db
        .prepare(`UPDATE ${table} SET data_encrypted = ?, updated_at = ? WHERE id = ?`)
        .run(blob, now, id);
      if (result.changes === 0) throw new NotFoundError(table, id);
      this.notifyChanged();
      return id;
    }
    const newEntryId = newId();
    this.ctx.db
      .prepare(`INSERT INTO ${table} (id, data_encrypted, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run(newEntryId, blob, now, now);
    this.notifyChanged();
    return newEntryId;
  }

  private remove(table: Table, id: string, entity: string): void {
    const result = this.ctx.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    if (result.changes === 0) throw new NotFoundError(entity, id);
    // La lápida es lo que hace que el borrado viaje (ver vaultTombstones.ts).
    recordTombstone(this.ctx.db, TOMBSTONE_KIND[table], id);
    this.notifyChanged();
  }

  /**
   * Avisa a `SyncManager` de que el vault ha cambiado. No se emite desde
   * `syncUpsert` (viene de otro dispositivo) ni desde `touch` (marcar como
   * usada en cada autorrelleno subiría el vault entero una y otra vez).
   */
  private notifyChanged(): void {
    syncEvents.emit('vault:changed', { profileId: this.ctx.profileId });
  }

  private touch(table: Table, id: string): void {
    this.ctx.db.prepare(`UPDATE ${table} SET last_used_at = ? WHERE id = ?`).run(Date.now(), id);
  }

  private syncUpsert(table: Table, meta: EntryMeta, data: object): void {
    if (typeof meta.id !== 'string' || !meta.id || typeof meta.updatedAt !== 'number') {
      throw new TypeError('[autofill-vault] entrada de sync sin id o updatedAt');
    }
    const existing = this.ctx.db
      .prepare(`SELECT updated_at FROM ${table} WHERE id = ?`)
      .get(meta.id) as { updated_at: number } | undefined;
    if (existing && existing.updated_at >= meta.updatedAt) return;

    const blob = encryptVaultString(JSON.stringify(data), this.key());
    this.ctx.db
      .prepare(
        `INSERT INTO ${table} (id, data_encrypted, created_at, updated_at, last_used_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           data_encrypted = excluded.data_encrypted,
           updated_at     = excluded.updated_at`,
      )
      .run(
        meta.id,
        blob,
        typeof meta.createdAt === 'number' ? meta.createdAt : meta.updatedAt,
        meta.updatedAt,
        typeof meta.lastUsedAt === 'number' ? meta.lastUsedAt : null,
      );
  }
}

export function toCardSummary(card: VaultCard): VaultCardSummary {
  return {
    id: card.id,
    holderName: card.holderName,
    alias: card.alias,
    brand: detectCardBrand(card.number),
    last4: cardLast4(card.number),
    expMonth: card.expMonth,
    expYear: card.expYear,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
    lastUsedAt: card.lastUsedAt,
  };
}

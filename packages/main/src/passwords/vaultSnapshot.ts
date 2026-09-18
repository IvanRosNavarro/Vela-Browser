import type { VaultAddress, VaultCard } from '@vela/shared';
import type { PasswordEntry, PasswordVault } from './PasswordVault';
import type { AutofillVault } from './AutofillVault';

/**
 * Formato del blob del vault que viaja por sync (cifrado con la clave de sync).
 *
 * Históricamente es un array JSON de `PasswordEntry`. Para no romper a los
 * dispositivos con versiones anteriores, que hacen `for (entry of array)
 * passwordVault.syncUpsert(entry)` con un try/catch por entrada, sigue siendo
 * un array: las direcciones y tarjetas se añaden como elementos con un campo
 * `kind`. Una versión anterior intenta insertarlas como contraseñas, falla por
 * las restricciones NOT NULL de `domain`/`username` (que estos elementos no
 * llevan) y las descarta una a una sin tocar el resto. Cambiar el blob a un
 * objeto habría hecho fallar el pull entero en esas versiones.
 */

export interface AddressSnapshotItem {
  kind: 'address';
  id: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
  data: Omit<VaultAddress, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt'>;
}

export interface CardSnapshotItem {
  kind: 'card';
  id: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
  data: Omit<VaultCard, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt'>;
}

export type VaultSnapshotItem = PasswordEntry | AddressSnapshotItem | CardSnapshotItem;

function split<T extends { id: string; createdAt: number; updatedAt: number; lastUsedAt: number | null }>(
  entry: T,
): { meta: Pick<T, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt'>; data: Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt'> } {
  const { id, createdAt, updatedAt, lastUsedAt, ...data } = entry;
  return { meta: { id, createdAt, updatedAt, lastUsedAt } as Pick<T, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt'>, data };
}

/** Construye el array del blob: contraseñas primero, luego direcciones y tarjetas. */
export function buildVaultSnapshot(
  passwords: readonly PasswordEntry[],
  autofill: { addresses: readonly VaultAddress[]; cards: readonly VaultCard[] },
): VaultSnapshotItem[] {
  const items: VaultSnapshotItem[] = [...passwords];
  for (const address of autofill.addresses) {
    const { meta, data } = split(address);
    items.push({ kind: 'address', ...meta, data });
  }
  for (const card of autofill.cards) {
    const { meta, data } = split(card);
    items.push({ kind: 'card', ...meta, data });
  }
  return items;
}

export interface ApplySnapshotResult {
  applied: number;
  /** Ids de las entradas descartadas (sin datos personales: aptos para log). */
  rejected: string[];
}

/**
 * Fusiona un blob recibido con el vault local, entrada a entrada y con LWW.
 * Acepta el formato antiguo (solo contraseñas) y el nuevo. Los elementos de
 * un `kind` desconocido (versiones futuras) se ignoran en silencio.
 */
export function applyVaultSnapshot(
  items: unknown,
  vaults: { passwordVault: Pick<PasswordVault, 'syncUpsert'>; autofillVault: Pick<AutofillVault, 'syncUpsertAddress' | 'syncUpsertCard'> },
): ApplySnapshotResult {
  const result: ApplySnapshotResult = { applied: 0, rejected: [] };
  if (!Array.isArray(items)) return result;
  for (const raw of items as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as { kind?: unknown; id?: unknown; data?: unknown };
    const id = typeof item.id === 'string' ? item.id : '?';
    try {
      if (item.kind === undefined) {
        vaults.passwordVault.syncUpsert(raw as PasswordEntry);
      } else if (item.kind === 'address') {
        const it = raw as AddressSnapshotItem;
        vaults.autofillVault.syncUpsertAddress({ ...(it.data ?? {}), id: it.id, createdAt: it.createdAt, updatedAt: it.updatedAt, lastUsedAt: it.lastUsedAt ?? null } as VaultAddress);
      } else if (item.kind === 'card') {
        const it = raw as CardSnapshotItem;
        vaults.autofillVault.syncUpsertCard({ ...(it.data ?? {}), id: it.id, createdAt: it.createdAt, updatedAt: it.updatedAt, lastUsedAt: it.lastUsedAt ?? null } as VaultCard);
      } else {
        continue;
      }
      result.applied++;
    } catch {
      result.rejected.push(id);
    }
  }
  return result;
}

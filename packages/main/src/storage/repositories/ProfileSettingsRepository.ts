import type { DatabaseSync } from 'node:sqlite';
import { syncEvents } from '../../sync/syncEvents';

interface SettingsRow {
  key: string;
  value: string;
}

/**
 * Prefijos de clave que NUNCA salen del dispositivo. Son secretos (material
 * criptográfico, tokens de sesión) o estado intrínsecamente local (qué
 * extensiones tiene instaladas ESTA máquina, qué certificado de cliente eligió
 * este equipo). Sincronizarlos filtraría claves o corrompería el estado del
 * otro dispositivo.
 */
const NON_SYNCABLE_PREFIXES = [
  'sync:',        // token de sesión, salt, clave cifrada, último seq
  'keyring:',     // clave del perfil envuelta + parámetros KDF
  'vault:',       // metadatos del vault de contraseñas
  'client-cert:', // elección de certificado por origen, propia del equipo
  'push:',        // suscripciones push, ligadas a este dispositivo
  'extensions:',  // qué extensiones hay instaladas aquí
];

function isSyncable(key: string): boolean {
  return !NON_SYNCABLE_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Repositorio key/value sobre la tabla `settings_profile` de profile.db.
 * Aloja ajustes que pertenecen a un perfil concreto (tema, motor de búsqueda,
 * scope MRU, etc.). Los valores se almacenan como TEXT; la serialización a
 * JSON la hace el caller (`ProfileSettings`/handlers IPC), igual que
 * AppMetadataRepository hace con app_metadata. Convivimos así con
 * `profile_metadata` (estado del perfil, no preferencias) sin mezclar scopes.
 */
export class ProfileSettingsRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly profileId?: string,
  ) {}

  get(key: string): string | null {
    const row = this.db
      .prepare('SELECT value FROM settings_profile WHERE key = ?')
      .get(key) as SettingsRow | undefined;
    return row ? row.value : null;
  }

  set(key: string, value: string): void {
    const now = Date.now();
    this.db
      .prepare(
        `INSERT INTO settings_profile (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                        updated_at = excluded.updated_at`,
      )
      .run(key, value, now);
    this.emitSyncChange(key, value, now);
  }

  /** Upsert desde sync remoto — no emite eventos (evita el eco al servidor). */
  syncSet(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings_profile (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                        updated_at = excluded.updated_at`,
      )
      .run(key, value, Date.now());
  }

  getUpdatedAt(key: string): number | null {
    const row = this.db
      .prepare('SELECT updated_at FROM settings_profile WHERE key = ?')
      .get(key) as { updated_at: number | null } | undefined;
    return row?.updated_at ?? null;
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM settings_profile WHERE key = ?').run(key);
  }

  list(): Record<string, string> {
    const rows = this.db
      .prepare('SELECT key, value FROM settings_profile')
      .all() as SettingsRow[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  /** Ajustes sincronizables con su timestamp, para el push inicial. */
  listSyncable(): Array<{ key: string; value: string; updatedAt: number }> {
    const rows = this.db
      .prepare('SELECT key, value, updated_at FROM settings_profile')
      .all() as Array<SettingsRow & { updated_at: number | null }>;
    return rows
      .filter((r) => isSyncable(r.key))
      .map((r) => ({
        key: r.key,
        value: r.value,
        updatedAt: r.updated_at ?? 0,
      }));
  }

  private emitSyncChange(key: string, value: string, updatedAt: number): void {
    if (!this.profileId || !isSyncable(key)) return;
    syncEvents.emit('entity:changed', {
      profileId: this.profileId,
      type: 'setting',
      id: key,
      data: { id: key, key, value, updatedAt },
      updatedAt,
    });
  }
}

import type { AppMetadataRepository } from '../storage/repositories';
import type { ProfileSettingsRepository } from '../storage/repositories/ProfileSettingsRepository';

/**
 * Lectura/escritura de ajustes del usuario. La interfaz es deliberadamente
 * mínima (`get`/`set`/`delete`/`list`) para que `GlobalSettings` y
 * `ProfileSettings` sean intercambiables desde un handler IPC con scope
 * dinámico. Los valores se serializan como JSON: el caller persiste objetos,
 * arrays, primitivos, y al leer recibe el mismo tipo de vuelta.
 */
export interface SettingsStore {
  get<T = unknown>(key: string): T | null;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  list(): Record<string, unknown>;
}

function parseStored(raw: string | null, key: string): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    throw new Error(
      `settings: el valor almacenado para "${key}" no es JSON válido: ${(err as Error).message}`,
    );
  }
}

/**
 * Settings globales (vela.db, app_metadata): scope app/usuario. Aloja claves
 * que NO dependen del perfil:
 *   - shortcuts:* (atajos custom — Fase 4)
 *   - last-active-profile (qué perfil reabrir al arrancar)
 *   - cualquier preferencia que el usuario espere ver con sólo cambiar de
 *     perfil (rar0).
 */
export class GlobalSettings implements SettingsStore {
  constructor(private readonly repo: AppMetadataRepository) {}

  get<T = unknown>(key: string): T | null {
    return parseStored(this.repo.get(key), key) as T | null;
  }

  set(key: string, value: unknown): void {
    this.repo.set(key, JSON.stringify(value));
  }

  delete(key: string): void {
    this.repo.delete(key);
  }

  list(): Record<string, unknown> {
    // app_metadata no expone listAll por ahora; los settings globales se
    // manejan clave a clave hasta que aparezca demanda real (Fase 4 con
    // shortcuts). Devolvemos vacío para no romper la interfaz.
    return {};
  }
}

/**
 * Settings del perfil (profile.db, settings_profile): scope perfil. Aloja
 * preferencias que cada perfil mantiene independientes (tema, motor de
 * búsqueda, scope MRU, reglas auto-grouping, API keys IA en Fase 5).
 */
export class ProfileSettings implements SettingsStore {
  constructor(private readonly repo: ProfileSettingsRepository) {}

  get<T = unknown>(key: string): T | null {
    return parseStored(this.repo.get(key), key) as T | null;
  }

  set(key: string, value: unknown): void {
    this.repo.set(key, JSON.stringify(value));
  }

  delete(key: string): void {
    this.repo.delete(key);
  }

  list(): Record<string, unknown> {
    const raw = this.repo.list();
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      out[k] = parseStored(v, k);
    }
    return out;
  }
}

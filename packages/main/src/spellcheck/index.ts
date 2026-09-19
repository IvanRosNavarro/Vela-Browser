import { app, type Session } from 'electron';
import type { SpellcheckInfo } from '@vela/shared';
import { logger } from '../logger';
import { syncEvents, type SyncEntityAppliedEvent } from '../sync/syncEvents';
import type { ProfileManager } from '../profiles/ProfileManager';
import {
  SPELLCHECK_ENABLED_KEY,
  SPELLCHECK_LANGUAGES_KEY,
  parseSpellcheckEnabled,
  parseSpellcheckLanguages,
  resolveSpellcheckLanguages,
} from './spellcheckSettings';

export {
  SPELLCHECK_ENABLED_KEY,
  SPELLCHECK_LANGUAGES_KEY,
} from './spellcheckSettings';

/** Lo único que necesitamos del repositorio de ajustes del perfil. */
interface RawSettingsReader {
  get(key: string): string | null;
}

/**
 * En macOS el corrector es el del sistema: detecta el idioma por su cuenta y
 * `setSpellCheckerLanguages` no hace nada.
 */
const SYSTEM_MANAGED = process.platform === 'darwin';

/** En Linux Electron usa Hunspell y baja los diccionarios de un CDN de Google. */
const DOWNLOADS_DICTIONARIES = process.platform === 'linux';

function systemLanguages(): string[] {
  try {
    return app.getPreferredSystemLanguages();
  } catch {
    return [app.getLocale()];
  }
}

function availableLanguages(ses: Session): string[] {
  try {
    return [...ses.availableSpellCheckerLanguages];
  } catch {
    return [];
  }
}

/**
 * Aplica a una sesión los ajustes de corrector del perfil. Se llama al abrir
 * el perfil, al cambiar el ajuste desde `vela://settings` y al recibirlo por
 * sync, así que tiene que ser idempotente. Nunca lanza: un idioma rechazado
 * por Chromium no debe impedir abrir el perfil.
 */
export function applySpellcheckSettings(
  ses: Session,
  settings: RawSettingsReader,
  label = 'perfil',
): void {
  const enabled = parseSpellcheckEnabled(settings.get(SPELLCHECK_ENABLED_KEY));
  try {
    ses.setSpellCheckerEnabled(enabled);
  } catch (err) {
    logger.warn(`[spellcheck ${label}] setSpellCheckerEnabled falló`, err);
    return;
  }
  if (!enabled || SYSTEM_MANAGED) return;

  const languages = resolveSpellcheckLanguages(
    parseSpellcheckLanguages(settings.get(SPELLCHECK_LANGUAGES_KEY)),
    systemLanguages(),
    availableLanguages(ses),
  );
  if (languages.length === 0) return;
  try {
    ses.setSpellCheckerLanguages(languages);
  } catch (err) {
    logger.warn(`[spellcheck ${label}] setSpellCheckerLanguages(${languages.join(',')}) falló`, err);
  }
}

/** Estado actual del corrector de una sesión, para la página de ajustes. */
export function getSpellcheckInfo(ses: Session, settings: RawSettingsReader): SpellcheckInfo {
  const requested = parseSpellcheckLanguages(settings.get(SPELLCHECK_LANGUAGES_KEY));
  let active: string[] = [];
  if (!SYSTEM_MANAGED) {
    try {
      active = [...ses.getSpellCheckerLanguages()];
    } catch {
      active = [];
    }
    if (active.length === 0) {
      active = resolveSpellcheckLanguages(requested, systemLanguages(), availableLanguages(ses));
    }
  }
  return {
    enabled: parseSpellcheckEnabled(settings.get(SPELLCHECK_ENABLED_KEY)),
    available: SYSTEM_MANAGED ? [] : availableLanguages(ses),
    active,
    followsSystem: requested === null,
    systemManaged: SYSTEM_MANAGED,
    downloadsDictionaries: DOWNLOADS_DICTIONARIES,
  };
}

export function isSpellcheckSettingKey(key: string): boolean {
  return key === SPELLCHECK_ENABLED_KEY || key === SPELLCHECK_LANGUAGES_KEY;
}

/** Reaplica los ajustes a la sesión de un perfil abierto. */
export function applySpellcheckForProfile(profileManager: ProfileManager, profileId: string): void {
  if (!profileManager.isOpen(profileId)) return;
  try {
    const ses = profileManager.getSession(profileId);
    const repos = profileManager.getRepositories(profileId);
    applySpellcheckSettings(ses, repos.settings, profileId);
  } catch (err) {
    logger.warn(`[spellcheck ${profileId}] no se pudieron reaplicar los ajustes`, err);
  }
}

let syncWatcherInstalled = false;

/**
 * Los ajustes del corrector se sincronizan. Cuando llega un cambio de otro
 * dispositivo hay que llevarlo a la sesión en caliente, igual que si el
 * usuario lo hubiera cambiado aquí.
 */
export function watchSpellcheckSync(profileManager: ProfileManager): void {
  if (syncWatcherInstalled) return;
  syncWatcherInstalled = true;
  syncEvents.on('entity:applied', (event: SyncEntityAppliedEvent) => {
    if (event.type !== 'setting' || !isSpellcheckSettingKey(event.id)) return;
    applySpellcheckForProfile(profileManager, event.profileId);
  });
}

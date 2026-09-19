import type { WebContents } from 'electron';
import {
  IPC_CHANNELS,
  DARKMODE_TAB_STATE_OFF,
  coerceDarkModeSettings,
  darkModeTabState,
  isDarkModeEffective,
  resolveDarkMode,
  toggleSiteOverride,
  type DarkModeSettings,
  type DarkModeTabState,
} from '@vela/shared';
import type { Logger } from '../logger';
import type { ProfileRepositories } from '../profiles/ProfileManager';
import { isVelaThemeDark } from './velaTheme';

export interface DarkModeManagerDeps {
  /** Repositorios del perfil, o null si está cerrado. */
  getRepositories: (profileId: string) => ProfileRepositories | null;
  /** `nativeTheme.shouldUseDarkColors`: resuelve el tema `system` de Vela. */
  prefersDarkColors: () => boolean;
  logger: Logger;
}

/**
 * Modo oscuro forzado de las webs con Dark Reader.
 *
 * Dark Reader corre en el preload de cada pestaña (`webTab.ts`), en su mundo
 * aislado. Aquí solo se decide qué documento lo lleva: el preload lo pregunta
 * de forma síncrona al arrancar cada documento (`darkmode:get-state-sync`) y
 * este manager le empuja los cambios (`darkmode:update`) cuando cambian los
 * ajustes, el tema de Vela o el del SO, sin recargar la página.
 */
export class DarkModeManager {
  /** WebContents de las pestañas → perfil al que pertenecen. */
  private readonly contents = new Map<WebContents, string>();
  /**
   * Pestañas cuyo documento actual ya era oscuro sin Dark Reader (lo detecta
   * el preload). Se olvida al empezar cada documento.
   */
  private readonly nativelyDark = new WeakSet<WebContents>();

  constructor(private readonly deps: DarkModeManagerDeps) {}

  /** Engancha el WebContents de una pestaña de usuario (`onTabViewWired`). */
  attach(wc: WebContents, profileId: string): void {
    if (this.contents.has(wc)) return;
    this.contents.set(wc, profileId);
    wc.once('destroyed', () => this.contents.delete(wc));
  }

  /** El preload arranca un documento nuevo: se olvida la detección anterior. */
  beginDocument(wc: WebContents): void {
    this.nativelyDark.delete(wc);
  }

  /** El preload informa de si el documento ya era oscuro por sí mismo. */
  setNativelyDark(wc: WebContents, dark: boolean): void {
    if (dark) this.nativelyDark.add(wc);
    else this.nativelyDark.delete(wc);
  }

  isAttached(wc: WebContents): boolean {
    return this.contents.has(wc);
  }

  readSettings(profileId: string): DarkModeSettings {
    const repos = this.deps.getRepositories(profileId);
    if (!repos) return coerceDarkModeSettings({});
    const read = (key: string): unknown => {
      try {
        const raw = repos.settings.get(key);
        return raw === null ? undefined : (JSON.parse(raw) as unknown);
      } catch {
        return undefined;
      }
    };
    return coerceDarkModeSettings({
      mode: read('darkmode:web'),
      brightness: read('darkmode:brightness'),
      contrast: read('darkmode:contrast'),
      sites: read('darkmode:sites'),
    });
  }

  isVelaThemeDark(profileId: string): boolean {
    const repos = this.deps.getRepositories(profileId);
    const prefersDark = this.deps.prefersDarkColors();
    if (!repos) return prefersDark;
    const read = (key: string): unknown => {
      try {
        const raw = repos.settings.get(key);
        return raw === null ? null : (JSON.parse(raw) as unknown);
      } catch {
        return null;
      }
    };
    return isVelaThemeDark(read('ui:theme'), read('ui:custom-themes'), prefersDark);
  }

  /**
   * Estado para el documento que `wc` está cargando en `url`. Un WebContents
   * que no sea una pestaña de usuario (Glance, popups…) nunca lo lleva.
   */
  stateFor(wc: WebContents, url: string): DarkModeTabState {
    const profileId = this.contents.get(wc);
    if (!profileId) return DARKMODE_TAB_STATE_OFF;
    const settings = this.readSettings(profileId);
    return darkModeTabState(url, settings, this.isVelaThemeDark(profileId));
  }

  /**
   * ¿Debe llevar Dark Reader el documento que muestra ahora `wc` según los
   * ajustes? (Antes de que el preload compruebe si la web ya era oscura.)
   */
  isEnabledFor(wc: WebContents): boolean {
    if (wc.isDestroyed()) return false;
    return this.stateFor(wc, wc.getURL()).enabled;
  }

  /** ¿Se ve ahora oscuro por Dark Reader el documento de `wc`? */
  isEffectiveFor(wc: WebContents): boolean {
    const profileId = this.contents.get(wc);
    if (!profileId || wc.isDestroyed()) return false;
    const decision = resolveDarkMode(
      wc.getURL(),
      this.readSettings(profileId),
      this.isVelaThemeDark(profileId),
    );
    return isDarkModeEffective(decision, this.nativelyDark.has(wc));
  }

  /**
   * Reenvía el estado a las pestañas abiertas (de un perfil o de todos) para
   * que el preload active, desactive o reajuste Dark Reader en caliente.
   */
  refreshAll(profileId?: string): void {
    const cache = new Map<string, { settings: DarkModeSettings; dark: boolean }>();
    for (const [wc, pid] of this.contents) {
      if (profileId && pid !== profileId) continue;
      if (wc.isDestroyed()) continue;
      let entry = cache.get(pid);
      if (!entry) {
        entry = { settings: this.readSettings(pid), dark: this.isVelaThemeDark(pid) };
        cache.set(pid, entry);
      }
      this.send(wc, darkModeTabState(wc.getURL(), entry.settings, entry.dark));
    }
  }

  /**
   * Alterna el modo oscuro en el sitio que muestra `wc` y lo aplica al vuelo
   * en todas las pestañas del perfil. Devuelve null si la página no admite
   * modo oscuro (páginas internas, `file:`…).
   */
  toggleSite(wc: WebContents): { host: string; applies: boolean } | null {
    const profileId = this.contents.get(wc);
    if (!profileId || wc.isDestroyed()) return null;
    const repos = this.deps.getRepositories(profileId);
    if (!repos) return null;
    const settings = this.readSettings(profileId);
    const result = toggleSiteOverride(
      wc.getURL(),
      settings,
      this.isVelaThemeDark(profileId),
      this.nativelyDark.has(wc),
    );
    if (!result) return null;
    try {
      // ProfileSettingsRepository sella updated_at y emite entity:changed:
      // la excepción viaja por sync como cualquier otro ajuste.
      repos.settings.set('darkmode:sites', JSON.stringify(result.sites));
    } catch (err) {
      this.deps.logger.warn('[darkmode] no se pudo guardar la excepción del sitio', err);
      return null;
    }
    this.refreshAll(profileId);
    return { host: result.host, applies: result.applies };
  }

  private send(wc: WebContents, state: DarkModeTabState): void {
    try {
      wc.send(IPC_CHANNELS.DARKMODE_UPDATE, state);
    } catch (err) {
      this.deps.logger.warn('[darkmode] no se pudo enviar el estado a la pestaña', err);
    }
  }
}

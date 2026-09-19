import type { WebContents } from 'electron';
import type { TabZoomState } from '@vela/shared';
import type { Logger } from '../logger';
import {
  DEFAULT_ZOOM_FACTOR,
  normalizeZoomFactor,
  parseZoomMap,
  stepZoomFactor,
  withZoomEntry,
  zoomFactorsEqual,
  zoomKeyForUrl,
  type ZoomMap,
} from './zoomLevels';

/** Ajuste de perfil con el mapa host → factor. No se sincroniza (`zoom:`). */
export const ZOOM_PER_SITE_KEY = 'zoom:per-site';

interface SettingsStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface ZoomManagerDeps {
  /** Ajustes del perfil, o null si está cerrado. */
  getSettings(profileId: string): SettingsStore | null;
  /** Pestaña fantasma: su zoom no se escribe en el perfil. */
  isSecureTab(tabId: string): boolean;
  emit(state: TabZoomState): void;
  logger: Pick<Logger, 'warn'>;
}

interface TrackedTab {
  wc: WebContents;
  profileId: string;
}

/**
 * Zoom de página de las pestañas (Ctrl+rueda, Ctrl+=/−/0, indicador de la
 * barra de direcciones).
 *
 * Chromium ya guarda el zoom por host en el `HostZoomMap` de cada sesión y lo
 * propaga a todas las pestañas de esa sesión con el mismo host —igual que
 * Chrome—, pero solo en memoria. Este gestor:
 *   - traduce `zoom-changed` (Ctrl+rueda) a escalones de Chrome;
 *   - persiste el factor por host en `zoom:per-site` del perfil;
 *   - lo reaplica en cada navegación, que es cuando el `HostZoomMap` de una
 *     sesión recién abierta aún no lo conoce;
 *   - avisa al renderer del factor de cada pestaña afectada.
 *
 * Las pestañas fantasma viven en su propia partición en memoria: heredan el
 * zoom guardado del perfil, pero lo que se cambia en ellas se queda en la
 * pestaña (escribirlo filtraría qué sitios se visitaron).
 */
export class ZoomManager {
  private readonly tabs = new Map<string, TrackedTab>();
  private readonly ephemeral = new Map<string, ZoomMap>();

  constructor(private readonly deps: ZoomManagerDeps) {}

  attach(tabId: string, wc: WebContents, profileId: string): void {
    if (this.tabs.get(tabId)?.wc === wc) return;
    this.tabs.set(tabId, { wc, profileId });

    // Ctrl+rueda (fuera de macOS: allí Chromium no lo convierte en zoom).
    // Electron no aplica zoom por sí mismo; solo avisa de la dirección.
    wc.on('zoom-changed', (_event, direction) => {
      this.step(tabId, direction);
    });
    wc.on('did-navigate', () => {
      this.applyStored(tabId);
    });
    wc.once('destroyed', () => {
      if (this.tabs.get(tabId)?.wc !== wc) return;
      this.tabs.delete(tabId);
      this.ephemeral.delete(tabId);
    });
  }

  /** Factor actual de la pestaña; 100 % si no tiene WebContents vivo. */
  getZoom(tabId: string): number {
    const wc = this.liveContents(tabId);
    if (!wc) return DEFAULT_ZOOM_FACTOR;
    return normalizeZoomFactor(wc.getZoomFactor());
  }

  getState(tabId: string): TabZoomState {
    return { tabId, factor: this.getZoom(tabId) };
  }

  /** Perfil de la pestaña, o null si no está enganchada. */
  getProfileForTab(tabId: string): string | null {
    return this.tabs.get(tabId)?.profileId ?? null;
  }

  step(tabId: string, direction: 'in' | 'out'): TabZoomState {
    return this.setZoom(tabId, stepZoomFactor(this.getZoom(tabId), direction));
  }

  reset(tabId: string): TabZoomState {
    return this.setZoom(tabId, DEFAULT_ZOOM_FACTOR);
  }

  setZoom(tabId: string, factor: number): TabZoomState {
    const tab = this.tabs.get(tabId);
    const wc = this.liveContents(tabId);
    if (!tab || !wc) return { tabId, factor: DEFAULT_ZOOM_FACTOR };

    const target = normalizeZoomFactor(factor);
    wc.setZoomFactor(target);

    const key = zoomKeyForUrl(wc.getURL());
    if (key === null) {
      this.notify(tabId);
    } else if (this.deps.isSecureTab(tabId)) {
      const map = this.ephemeral.get(tabId) ?? {};
      this.ephemeral.set(tabId, withZoomEntry(map, key, target));
      this.notify(tabId);
    } else {
      this.persist(tab.profileId, key, target);
      // Chromium ya ha propagado el nivel a las demás pestañas de la sesión
      // con el mismo host (split view incluido): se avisa de todas.
      this.notifySameSite(tab.profileId, key);
    }
    return this.getState(tabId);
  }

  /** Emite el factor actual de la pestaña (p. ej. al activarla). */
  notify(tabId: string): void {
    this.deps.emit(this.getState(tabId));
  }

  /**
   * Reaplica el zoom recordado del host al que acaba de navegar la pestaña.
   * Si el host no tiene entrada, vuelve a 100 %: el `HostZoomMap` podría
   * conservar un nivel ya borrado del perfil desde otra vía.
   */
  private applyStored(tabId: string): void {
    const tab = this.tabs.get(tabId);
    const wc = this.liveContents(tabId);
    if (!tab || !wc) return;

    const key = zoomKeyForUrl(wc.getURL());
    if (key !== null) {
      const own = this.deps.isSecureTab(tabId) ? this.ephemeral.get(tabId)?.[key] : undefined;
      const desired = own ?? this.readMap(tab.profileId)[key] ?? DEFAULT_ZOOM_FACTOR;
      if (!zoomFactorsEqual(wc.getZoomFactor(), desired)) {
        try {
          wc.setZoomFactor(desired);
        } catch (err) {
          this.deps.logger.warn('[zoom] setZoomFactor al navegar falló', err);
        }
      }
    }
    this.notify(tabId);
  }

  private notifySameSite(profileId: string, key: string): void {
    for (const [tabId, tab] of this.tabs) {
      if (tab.profileId !== profileId || tab.wc.isDestroyed()) continue;
      if (this.deps.isSecureTab(tabId)) continue;
      if (zoomKeyForUrl(tab.wc.getURL()) !== key) continue;
      this.notify(tabId);
    }
  }

  private readMap(profileId: string): ZoomMap {
    try {
      return parseZoomMap(this.deps.getSettings(profileId)?.get(ZOOM_PER_SITE_KEY));
    } catch (err) {
      this.deps.logger.warn('[zoom] no se pudo leer el zoom por sitio', err);
      return {};
    }
  }

  private persist(profileId: string, key: string, factor: number): void {
    try {
      const settings = this.deps.getSettings(profileId);
      if (!settings) return;
      const next = withZoomEntry(parseZoomMap(settings.get(ZOOM_PER_SITE_KEY)), key, factor);
      settings.set(ZOOM_PER_SITE_KEY, JSON.stringify(next));
    } catch (err) {
      this.deps.logger.warn('[zoom] no se pudo guardar el zoom por sitio', err);
    }
  }

  private liveContents(tabId: string): WebContents | null {
    const wc = this.tabs.get(tabId)?.wc;
    return wc && !wc.isDestroyed() ? wc : null;
  }
}

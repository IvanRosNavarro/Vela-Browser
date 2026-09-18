import type { WebContents } from 'electron';
import type { AppMetadataRepository } from '../storage/repositories/AppMetadataRepository';
import type { Logger } from '../logger';

/** Ampliación máxima del zoom por pellizco (la del ejemplo de Electron). */
const MAX_PINCH_ZOOM = 3;

/**
 * Gestos de trackpad en las pestañas.
 *
 * - Swipe de dos dedos: lo detecta el preload de la pestaña (`webTab.ts`)
 *   y llega por `trackpad:navigate`; aquí solo se exponen los ajustes.
 * - Pellizco: Electron desactiva el zoom visual por defecto. Se habilita
 *   por WebContents con `setVisualZoomLevelLimits`.
 */
export class TrackpadGestures {
  private readonly contents = new Set<WebContents>();

  constructor(
    private readonly appMetadata: AppMetadataRepository,
    private readonly logger: Logger,
  ) {}

  private getFlag(key: string): boolean {
    try {
      const raw = this.appMetadata.get(key);
      return raw === null ? true : (JSON.parse(raw) as boolean) !== false;
    } catch {
      return true;
    }
  }

  isNavigationEnabled(): boolean {
    return this.getFlag('gestures:trackpad-navigation');
  }

  isPinchZoomEnabled(): boolean {
    return this.getFlag('gestures:pinch-zoom');
  }

  /**
   * Engancha el WebContents de una pestaña. Los límites se aplican en cada
   * `dom-ready`: viven en el renderer, y navegar a otro sitio puede
   * cambiar de proceso.
   */
  attach(wc: WebContents): void {
    if (this.contents.has(wc)) return;
    this.contents.add(wc);
    wc.on('dom-ready', () => this.applyPinchZoom(wc));
    wc.once('destroyed', () => this.contents.delete(wc));
  }

  /** Tras cambiar el ajuste, para que surta efecto sin recargar. */
  applyPinchZoomToAll(): void {
    for (const wc of this.contents) this.applyPinchZoom(wc);
  }

  private applyPinchZoom(wc: WebContents): void {
    if (wc.isDestroyed()) return;
    const max = this.isPinchZoomEnabled() ? MAX_PINCH_ZOOM : 1;
    wc.setVisualZoomLevelLimits(1, max).catch((err: unknown) => {
      this.logger.warn('[trackpad] setVisualZoomLevelLimits falló', err);
    });
  }
}

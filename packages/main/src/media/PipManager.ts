import {
  webContents as webContentsModule,
  webFrameMain,
  type WebContents,
  type WebContentsView,
  type WebFrameMain,
} from 'electron';
import { z, type PipToggleResult } from '@vela/shared';
import type { Logger } from '../logger';
import {
  diffVisibleTabs,
  pickPipCandidate,
  shouldAutoEnterPip,
  type FrameProbe,
} from './pipPolicy';

export interface PipManagerCtx {
  logger: Logger;
  /** Ajuste global `media:auto-pip` (se lee en cada transición). */
  isAutoPipEnabled: () => boolean;
  /** WCV vivo de la pestaña, esté adjunto a una ventana o suspendido. */
  getViewForTab: (tabId: string) => WebContentsView | null;
  /** Pista barata de que la pestaña reproduce algo, para no sondear en vano. */
  isTabPlayingMedia: (tabId: string) => boolean;
}

/**
 * Margen entre que la pestaña deja de verse y el intento de PiP. Absorbe las
 * transiciones de paso (Ctrl+Tab recorriendo pestañas, cerrar la activa) sin
 * que se note al cambiar de pestaña de verdad.
 */
const AUTO_PIP_DELAY_MS = 150;
/** Tope por frame: un iframe colgado no debe bloquear la decisión. */
const FRAME_SCRIPT_TIMEOUT_MS = 1500;

/**
 * Recoge los `<video>` del documento, incluidos los de shadow roots abiertos
 * de primer nivel (reproductores con web components). El orden es estable
 * entre el sondeo y la petición de PiP, que localiza el vídeo por índice.
 */
const COLLECT_VIDEOS_JS = `
  const collectVideos = () => {
    const out = Array.from(document.querySelectorAll('video'));
    for (const host of document.querySelectorAll('*')) {
      if (host.shadowRoot) out.push(...host.shadowRoot.querySelectorAll('video'));
    }
    return out;
  };
`;

/**
 * Sondeo de solo lectura. Si la vista ya está oculta (Vela la reduce a 1×1
 * px) el tamaño maquetado deja de ser fiable y se usa el intrínseco.
 */
const PROBE_JS = `(() => {
  try {
    ${COLLECT_VIDEOS_JS}
    const pipEl = document.pictureInPictureElement;
    const tiny = window.innerWidth < 50 || window.innerHeight < 50;
    const videos = collectVideos().map((v, index) => {
      const r = v.getBoundingClientRect();
      const decoded = v.webkitAudioDecodedByteCount;
      return {
        index,
        width: tiny ? v.videoWidth : r.width,
        height: tiny ? v.videoHeight : r.height,
        paused: v.paused,
        ended: v.ended,
        muted: v.muted,
        volume: v.volume,
        loop: v.loop,
        readyState: v.readyState,
        disablePictureInPicture: v.disablePictureInPicture === true,
        hasAudio: typeof decoded === 'number' ? decoded > 0 : null,
        inPip: pipEl === v,
      };
    });
    return {
      pipEnabled: document.pictureInPictureEnabled === true,
      inPip: pipEl != null,
      videos,
    };
  } catch (e) {
    return null;
  }
})()`;

function enterJs(index: number): string {
  return `(async () => {
    ${COLLECT_VIDEOS_JS}
    const v = collectVideos()[${index}];
    if (!v) return 'missing';
    try { await v.requestPictureInPicture(); return 'ok'; }
    catch (e) { return (e && e.name) || 'error'; }
  })()`;
}

const EXIT_JS = `(async () => {
  if (!document.pictureInPictureElement) return false;
  try { await document.exitPictureInPicture(); return true; } catch (e) { return false; }
})()`;

/**
 * PiP pedido desde el menú contextual sobre un vídeo concreto. Solo en el
 * frame principal las coordenadas del menú son las del documento; en un
 * iframe se usa el vídeo más grande del frame.
 */
function toggleAtPointJs(point: { x: number; y: number } | null): string {
  const pointJs = point
    ? `document.elementsFromPoint(${point.x}, ${point.y}).find((e) => e instanceof HTMLVideoElement) || null`
    : 'null';
  return `(async () => {
    ${COLLECT_VIDEOS_JS}
    const at = ${pointJs};
    const current = document.pictureInPictureElement;
    try {
      if (current && (!at || current === at)) {
        await document.exitPictureInPicture();
        return 'exited';
      }
      const largest = () => collectVideos()
        .filter((v) => !v.disablePictureInPicture && v.readyState >= 1)
        .sort((a, b) => {
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          return rb.width * rb.height - ra.width * ra.height;
        })[0] || null;
      const v = at || largest();
      if (!v || v.disablePictureInPicture) return 'none';
      await v.requestPictureInPicture();
      return 'entered';
    } catch (e) {
      return 'none';
    }
  })()`;
}

const videoProbeSchema = z.object({
  index: z.number().int().nonnegative(),
  width: z.number(),
  height: z.number(),
  paused: z.boolean(),
  ended: z.boolean(),
  muted: z.boolean(),
  volume: z.number(),
  loop: z.boolean(),
  readyState: z.number(),
  disablePictureInPicture: z.boolean(),
  hasAudio: z.boolean().nullable(),
  inPip: z.boolean(),
});
const frameProbeSchema = z.object({
  pipEnabled: z.boolean(),
  inPip: z.boolean(),
  videos: z.array(videoProbeSchema).max(500),
});
const pipChangedSchema = z.object({ active: z.boolean() });

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}

/** Frames vivos de la pestaña, el principal primero. */
function liveFrames(wc: WebContents): WebFrameMain[] {
  try {
    return wc.mainFrame.framesInSubtree.filter((f) => !f.detached);
  } catch {
    return [];
  }
}

/**
 * Imagen en imagen automática (al dejar de ver una pestaña con vídeo) y
 * manual (menú contextual, popup multimedia y comando).
 *
 * `TabManager` informa del conjunto de pestañas visibles de cada ventana
 * tras cada cambio (`onVisibleTabsChanged`); aquí se calcula qué pestañas
 * han dejado de verse o han vuelto a verse. La petición de PiP se hace con
 * `executeJavaScript(…, true)`: `requestPictureInPicture()` exige activación
 * de usuario y el `userGesture` la concede, igual que en los controles
 * multimedia (ADR 0033). Se alcanza cualquier frame, iframes de otro origen
 * incluidos, vía `WebFrameMain.executeJavaScript`.
 */
export class PipManager {
  private readonly visibleByWindow = new Map<number, ReadonlySet<string>>();
  /** Pestañas con un vídeo en PiP ahora mismo. */
  private readonly pipTabs = new Set<string>();
  /** Subconjunto de `pipTabs` que entró en PiP automáticamente. */
  private readonly autoPipTabs = new Set<string>();
  private readonly pendingTimers = new Map<string, NodeJS.Timeout>();
  /** Se incrementa en cada cambio de visibilidad; invalida intentos en vuelo. */
  private readonly generation = new Map<string, number>();
  private readonly attached = new WeakSet<WebContents>();
  private warnedDisabled = false;

  constructor(private readonly ctx: PipManagerCtx) {}

  /** Escucha el estado de PiP que informa el preload de la pestaña. */
  attachToTab(tabId: string, wc: WebContents): void {
    if (this.attached.has(wc)) return;
    this.attached.add(wc);

    wc.ipc.on('media:pip-changed', (_event, raw: unknown) => {
      const parsed = pipChangedSchema.safeParse(raw);
      if (!parsed.success) return;
      if (parsed.data.active) {
        this.pipTabs.add(tabId);
      } else {
        this.pipTabs.delete(tabId);
        this.autoPipTabs.delete(tabId);
      }
    });

    // Navegar el documento cierra su PiP sin que el preload llegue a avisar.
    wc.on('did-navigate', () => {
      this.pipTabs.delete(tabId);
      this.autoPipTabs.delete(tabId);
    });

    wc.once('destroyed', () => {
      this.pipTabs.delete(tabId);
      this.autoPipTabs.delete(tabId);
      this.cancelPending(tabId);
      this.generation.delete(tabId);
    });
  }

  /** Para `DiscardManager`: una pestaña con PiP activo no se descarta. */
  isTabInPip(tabId: string): boolean {
    return this.pipTabs.has(tabId);
  }

  /**
   * Nuevo conjunto de pestañas visibles de una ventana (`null` = ventana
   * cerrada). Idempotente: se puede llamar en cada recálculo de bounds.
   */
  onVisibleTabsChanged(windowId: number, visible: ReadonlySet<string> | null): void {
    if (visible === null) {
      this.visibleByWindow.delete(windowId);
      return;
    }
    const prev = this.visibleByWindow.get(windowId) ?? new Set<string>();
    const next = new Set(visible);
    this.visibleByWindow.set(windowId, next);

    const { hidden, shown } = diffVisibleTabs(prev, next);
    for (const tabId of shown) {
      this.bump(tabId);
      this.cancelPending(tabId);
      if (this.autoPipTabs.has(tabId)) void this.exitPip(tabId);
    }
    for (const tabId of hidden) {
      this.bump(tabId);
      this.scheduleAutoEnter(tabId);
    }
  }

  /**
   * Alterna PiP en la pestaña: si algún frame tiene un vídeo en PiP lo saca;
   * si no, mete el vídeo más grande (prefiriendo el que se reproduce).
   */
  async toggleForTab(tabId: string): Promise<PipToggleResult> {
    const wc = this.liveWebContents(tabId);
    if (!wc) return 'none';
    const probes = await this.probeAll(wc);
    if (probes.some((p) => p.probe.inPip)) {
      await this.exitPip(tabId);
      return 'exited';
    }
    const candidate = pickPipCandidate(probes, 'manual');
    if (!candidate) return 'none';
    const ok = await this.enter(candidate.frame, candidate.video.index);
    if (!ok) return 'none';
    this.pipTabs.add(tabId);
    this.autoPipTabs.delete(tabId);
    return 'entered';
  }

  /**
   * Alterna PiP del vídeo sobre el que se abrió el menú contextual. `point`
   * son coordenadas del documento del frame principal; en iframes se ignora.
   */
  async toggleInFrame(
    tabId: string | null,
    wc: WebContents,
    frameRef: { processId: number; frameToken: string },
    point: { x: number; y: number },
  ): Promise<PipToggleResult> {
    if (wc.isDestroyed()) return 'none';
    let frame: WebFrameMain | null = null;
    try {
      frame = webFrameMain.fromFrameToken(frameRef.processId, frameRef.frameToken);
    } catch {
      frame = null;
    }
    // El frame tiene que ser de esta pestaña: la acción llega del popup del
    // menú contextual, pero no se confía en los identificadores sin comprobar.
    if (!frame || frame.detached || webContentsModule.fromFrame(frame)?.id !== wc.id) return 'none';

    // Las coordenadas del menú están en DIP de la vista; el documento las
    // espera en px CSS, que con zoom de página no coinciden.
    const zoom = wc.getZoomFactor() || 1;
    const docPoint = frame.parent === null
      ? { x: Math.round(point.x / zoom), y: Math.round(point.y / zoom) }
      : null;
    const raw = await withTimeout(
      frame.executeJavaScript(toggleAtPointJs(docPoint), true) as Promise<unknown>,
      FRAME_SCRIPT_TIMEOUT_MS,
    );
    const result: PipToggleResult =
      raw === 'entered' || raw === 'exited' ? raw : 'none';
    if (tabId) {
      if (result === 'entered') {
        this.pipTabs.add(tabId);
        this.autoPipTabs.delete(tabId);
      } else if (result === 'exited') {
        this.pipTabs.delete(tabId);
        this.autoPipTabs.delete(tabId);
      }
    }
    return result;
  }

  // ---------- internos ----------

  private bump(tabId: string): number {
    const next = (this.generation.get(tabId) ?? 0) + 1;
    this.generation.set(tabId, next);
    return next;
  }

  private cancelPending(tabId: string): void {
    const timer = this.pendingTimers.get(tabId);
    if (timer) {
      clearTimeout(timer);
      this.pendingTimers.delete(tabId);
    }
  }

  private isVisibleAnywhere(tabId: string): boolean {
    for (const set of this.visibleByWindow.values()) {
      if (set.has(tabId)) return true;
    }
    return false;
  }

  private liveWebContents(tabId: string): WebContents | null {
    const wc = this.ctx.getViewForTab(tabId)?.webContents;
    return wc && !wc.isDestroyed() ? wc : null;
  }

  private scheduleAutoEnter(tabId: string): void {
    this.cancelPending(tabId);
    const gen = this.generation.get(tabId) ?? 0;
    const timer = setTimeout(() => {
      this.pendingTimers.delete(tabId);
      void this.maybeAutoEnter(tabId, gen).catch((err: unknown) => {
        this.ctx.logger.warn(`[pip] auto-PiP falló (tab=${tabId})`, err);
      });
    }, AUTO_PIP_DELAY_MS);
    this.pendingTimers.set(tabId, timer);
  }

  private async maybeAutoEnter(tabId: string, gen: number): Promise<void> {
    if (!this.ctx.isAutoPipEnabled()) return;
    const wc = this.liveWebContents(tabId);
    if (!wc || this.isVisibleAnywhere(tabId)) return;
    // Sin audio ni reproducción conocida no merece la pena sondear la página.
    if (!wc.isCurrentlyAudible() && !this.ctx.isTabPlayingMedia(tabId)) return;

    const probes = await this.probeAll(wc);
    if (this.generation.get(tabId) !== gen) return;

    if (probes.length > 0 && probes.every((p) => !p.probe.pipEnabled)) {
      if (!this.warnedDisabled) {
        this.warnedDisabled = true;
        this.ctx.logger.warn('[pip] document.pictureInPictureEnabled es false en la pestaña');
      }
      return;
    }

    const candidate = pickPipCandidate(probes, 'auto');
    const decide = shouldAutoEnterPip(
      {
        enabled: this.ctx.isAutoPipEnabled(),
        alive: !wc.isDestroyed(),
        visibleElsewhere: this.isVisibleAnywhere(tabId),
        alreadyInPip: probes.some((p) => p.probe.inPip),
      },
      candidate,
    );
    if (!decide) return;

    const ok = await this.enter(candidate.frame, candidate.video.index);
    if (!ok) return;
    this.pipTabs.add(tabId);
    this.autoPipTabs.add(tabId);
    this.ctx.logger.info(`[pip] tab=${tabId} pasa a imagen en imagen`);

    // El usuario volvió a la pestaña mientras se pedía el PiP.
    if (this.generation.get(tabId) !== gen || this.isVisibleAnywhere(tabId)) {
      await this.exitPip(tabId);
    }
  }

  private async probeAll(
    wc: WebContents,
  ): Promise<Array<{ frame: WebFrameMain; probe: FrameProbe }>> {
    const frames = liveFrames(wc);
    const results = await Promise.all(
      frames.map(async (frame) => {
        const raw = await withTimeout(
          frame.executeJavaScript(PROBE_JS, false) as Promise<unknown>,
          FRAME_SCRIPT_TIMEOUT_MS,
        );
        const parsed = frameProbeSchema.safeParse(raw);
        return parsed.success ? { frame, probe: parsed.data } : null;
      }),
    );
    return results.filter((r): r is { frame: WebFrameMain; probe: FrameProbe } => r !== null);
  }

  private async enter(frame: WebFrameMain, index: number): Promise<boolean> {
    if (frame.detached) return false;
    const result = await withTimeout(
      frame.executeJavaScript(enterJs(index), true) as Promise<unknown>,
      FRAME_SCRIPT_TIMEOUT_MS,
    );
    if (result !== 'ok') {
      this.ctx.logger.info(`[pip] requestPictureInPicture rechazado: ${String(result)}`);
      return false;
    }
    return true;
  }

  private async exitPip(tabId: string): Promise<void> {
    this.autoPipTabs.delete(tabId);
    const wc = this.liveWebContents(tabId);
    if (!wc) {
      this.pipTabs.delete(tabId);
      return;
    }
    await Promise.all(
      liveFrames(wc).map((frame) =>
        withTimeout(frame.executeJavaScript(EXIT_JS, false) as Promise<unknown>, FRAME_SCRIPT_TIMEOUT_MS),
      ),
    );
    this.pipTabs.delete(tabId);
  }
}

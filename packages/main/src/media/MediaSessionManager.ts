import { WebContentsView } from 'electron';
import type { MediaSource } from '@vela/shared';
import type { MainEventBus } from '../ipc/events';
import type { Logger } from '../logger';
import {
  findMediaTarget,
  installMediaBridge,
  isWorthShowing,
  pickElement,
  probeFrame,
  runMediaAction,
  type FrameMediaProbe,
  type MediaTarget,
} from './mediaFrames';

export interface MediaManagerCtx {
  events: MainEventBus;
  logger: Logger;
  getWcvForTab: (tabId: string) => WebContentsView | null;
  getWindowIdForTab: (tabId: string) => number | null;
}

/**
 * Margen tras `media-started-playing` para que la página haya podido poner su
 * metadata y registrar sus handlers antes del primer sondeo.
 */
const METADATA_DELAY_MS = 300;

export class MediaSessionManager {
  private readonly sources = new Map<string, MediaSource>();
  /** Último frame que mandaba en cada pestaña, para no resondear toda la pestaña. */
  private readonly targets = new Map<string, MediaTarget>();

  constructor(private readonly ctx: MediaManagerCtx) {}

  attachToTab(
    tabId: string,
    view: WebContentsView,
    windowId: number,
    profileId: string,
  ): void {
    const wc = view.webContents;

    wc.on('media-started-playing', () => {
      void this.onMediaStarted(tabId, view, windowId, profileId);
    });

    wc.on('media-paused', () => {
      this.onMediaPaused(tabId);
    });

    // Un `<video>` decorativo no crea fuente al arrancar, pero si la pestaña
    // empieza a sonar de verdad más tarde (el usuario le quita el silencio) hay
    // que recogerla igualmente.
    wc.on('audio-state-changed', (event) => {
      if (event.audible && !this.sources.has(tabId)) {
        void this.onMediaStarted(tabId, view, windowId, profileId);
      }
    });

    // Metadata del frame principal empujada por el poller del preload. Solo
    // actualiza metadata: `isPlaying` lo llevan los eventos de Electron, que
    // detectan reproducción real del elemento y son mucho más fiables que
    // `mediaSession.playbackState` (muchos sitios lo dejan en 'paused').
    wc.ipc.on('media:state-update', (_event, data: unknown) => {
      const source = this.sources.get(tabId);
      if (!source || typeof data !== 'object' || !data) return;
      const d = data as Record<string, unknown>;
      let changed = false;
      if (typeof d.title === 'string' && d.title && d.title !== source.title) {
        source.title = d.title;
        changed = true;
      }
      if (typeof d.artist === 'string') {
        const artist = d.artist || null;
        if (artist !== source.artist) { source.artist = artist; changed = true; }
      }
      if (typeof d.artworkUrl === 'string') {
        const url = d.artworkUrl || null;
        if (url !== source.artworkUrl) { source.artworkUrl = url; changed = true; }
      }
      if (changed) this.emitState();
    });

    // Al cambiar de página la fuente deja de existir. Sin esto el icono de la
    // title bar se quedaba encendido hasta cerrar la pestaña.
    wc.on('did-start-navigation', (event) => {
      if (!event.isMainFrame || event.isSameDocument) return;
      this.forget(tabId);
    });

    wc.once('destroyed', () => {
      this.forget(tabId);
    });
  }

  private forget(tabId: string): void {
    this.targets.delete(tabId);
    if (this.sources.delete(tabId)) this.emitState();
  }

  private async onMediaStarted(
    tabId: string,
    view: WebContentsView,
    windowId: number,
    profileId: string,
  ): Promise<void> {
    const wc = view.webContents;
    if (wc.isDestroyed()) return;

    // El puente tiene que estar puesto antes de que la página registre sus
    // handlers del cambio de pista; se reinstala en cada arranque porque los
    // reproductores vuelven a registrarlos en cada canción.
    await installMediaBridge(wc);
    await new Promise<void>((r) => setTimeout(r, METADATA_DELAY_MS));
    if (wc.isDestroyed()) return;

    const target = await findMediaTarget(wc);
    if (!target) return;

    const existing = this.sources.get(tabId);
    if (
      !existing &&
      !isWorthShowing(wc.isCurrentlyAudible(), target.probe, target.element)
    ) {
      return;
    }

    const source: MediaSource = existing ?? {
      tabId,
      windowId,
      profileId,
      title: 'Reproduciendo',
      artist: null,
      album: null,
      artworkUrl: null,
      isPlaying: true,
      duration: null,
      currentTime: null,
      hasMediaSession: false,
      canSkipNext: false,
      canSkipPrev: false,
      canSeek: false,
    };
    source.windowId = windowId;
    this.applyProbe(source, target.probe);
    // Electron ha disparado `media-started-playing`: eso manda sobre
    // `playbackState`, que muchos sitios dejan en 'paused' mientras suenan.
    source.isPlaying = true;

    this.targets.set(tabId, target);
    this.sources.set(tabId, source);
    this.emitState();
  }

  private applyProbe(source: MediaSource, probe: FrameMediaProbe): void {
    const element = pickElement(probe);
    if (probe.title) source.title = probe.title;
    source.artist = probe.artist;
    source.album = probe.album;
    source.artworkUrl = probe.artworkUrl;
    source.hasMediaSession = probe.hasMediaSession;
    source.canSkipNext = probe.actions.includes('nexttrack');
    source.canSkipPrev = probe.actions.includes('previoustrack');
    source.canSeek = element !== null && element.duration !== null;
    source.duration = probe.position?.duration ?? element?.duration ?? null;
    source.currentTime = probe.position?.position ?? element?.currentTime ?? null;
  }

  private onMediaPaused(tabId: string): void {
    const source = this.sources.get(tabId);
    if (source) {
      source.isPlaying = false;
      this.emitState();
    }
  }

  private emitState(): void {
    this.ctx.events.emit('state:media-changed', {
      sources: [...this.sources.values()],
    });
  }

  /**
   * Frame que manda en la pestaña. Reutiliza el de la última vez mientras siga
   * vivo: recorrer todos los frames en cada comando es caro y el reproductor
   * rara vez cambia de sitio.
   */
  private async resolveTarget(tabId: string, refresh = false): Promise<MediaTarget | null> {
    const cached = this.targets.get(tabId);
    if (cached && !cached.frame.detached && !refresh) return cached;

    if (cached && !cached.frame.detached) {
      const probe = await probeFrame(cached.frame);
      if (probe && probe.elements.length > 0) {
        const updated: MediaTarget = { frame: cached.frame, probe, element: pickElement(probe) };
        this.targets.set(tabId, updated);
        return updated;
      }
    }

    const view = this.ctx.getWcvForTab(tabId);
    if (!view || view.webContents.isDestroyed()) return null;
    const target = await findMediaTarget(view.webContents);
    if (target) this.targets.set(tabId, target);
    return target;
  }

  private async command(
    tabId: string,
    action: Parameters<typeof runMediaAction>[1],
  ): Promise<boolean> {
    const target = await this.resolveTarget(tabId, true);
    if (!target) {
      this.ctx.logger.warn(`[MediaSession] ${action.kind}: sin objetivo en tabId=${tabId}`);
      return false;
    }
    const done = await runMediaAction(target, action);
    this.ctx.logger.info(`[MediaSession] ${action.kind}(${tabId}) → ${done}`);
    return done;
  }

  async play(tabId: string): Promise<void> {
    await this.command(tabId, { kind: 'play' });
  }

  async pause(tabId: string): Promise<void> {
    await this.command(tabId, { kind: 'pause' });
  }

  async skipNext(tabId: string): Promise<void> {
    await this.command(tabId, { kind: 'nexttrack' });
  }

  async skipPrev(tabId: string): Promise<void> {
    await this.command(tabId, { kind: 'previoustrack' });
  }

  async seekBy(tabId: string, delta: number): Promise<void> {
    await this.command(tabId, { kind: 'seekBy', delta });
  }

  async seekTo(tabId: string, time: number): Promise<void> {
    await this.command(tabId, { kind: 'seekTo', time });
  }

  /**
   * Posición para la barra de progreso. Sondea solo el frame que manda, y de
   * paso refresca la metadata: así un cambio de pista dentro de un iframe se
   * nota sin que el preload del frame principal se entere de nada.
   */
  async getCurrentTime(tabId: string): Promise<{ currentTime: number; duration: number | null }> {
    const target = await this.resolveTarget(tabId);
    if (!target) return { currentTime: 0, duration: null };

    const probe = (await probeFrame(target.frame)) ?? target.probe;
    const element = pickElement(probe);
    const currentTime = probe.position?.position ?? element?.currentTime ?? 0;
    const duration = probe.position?.duration ?? element?.duration ?? null;

    const source = this.sources.get(tabId);
    if (source) {
      const before = JSON.stringify([source.title, source.artist, source.artworkUrl]);
      this.applyProbe(source, probe);
      if (JSON.stringify([source.title, source.artist, source.artworkUrl]) !== before) {
        this.emitState();
      }
    }
    return { currentTime, duration };
  }

  getSources(): MediaSource[] {
    return [...this.sources.values()];
  }

  /** La pestaña tiene una fuente multimedia reproduciéndose (según Chromium). */
  isTabPlaying(tabId: string): boolean {
    return this.sources.get(tabId)?.isPlaying === true;
  }

  getActiveCount(): number {
    return [...this.sources.values()].filter((s) => s.isPlaying).length;
  }
}

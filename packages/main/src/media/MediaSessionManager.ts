import { WebContentsView } from 'electron';
import type { MediaSource } from '@vela/shared';
import type { MainEventBus } from '../ipc/events';
import type { Logger } from '../logger';

export interface MediaManagerCtx {
  events: MainEventBus;
  logger: Logger;
  getWcvForTab: (tabId: string) => WebContentsView | null;
  getWindowIdForTab: (tabId: string) => number | null;
}

export class MediaSessionManager {
  private readonly sources = new Map<string, MediaSource>();

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

    // Metadata updates pushed by the preload bridge poller every 500 ms.
    // Only updates metadata — isPlaying is managed solely by the Electron
    // media-started-playing/media-paused events, which detect actual DOM
    // element playback and are far more reliable than mediaSession.playbackState
    // (many sites leave playbackState='paused' even while audio is playing).
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

    wc.once('destroyed', () => {
      if (this.sources.delete(tabId)) {
        this.emitState();
      }
    });
  }

  private async onMediaStarted(
    tabId: string,
    view: WebContentsView,
    windowId: number,
    profileId: string,
  ): Promise<void> {
    const wc = view.webContents;
    if (wc.isDestroyed()) return;

    // Small delay so the page has time to set navigator.mediaSession.metadata.
    await new Promise<void>((r) => setTimeout(r, 300));
    if (wc.isDestroyed()) return;

    const source: MediaSource = {
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
    };

    const meta = await this.getMetadata(tabId, view);
    if (meta) Object.assign(source, meta);
    // Electron fired media-started-playing — trust it over mediaSession.playbackState,
    // which many sites (e.g. Suno) leave as 'paused' even while audio is playing.
    source.isPlaying = true;

    this.sources.set(tabId, source);
    this.emitState();
  }

  private onMediaPaused(tabId: string): void {
    const source = this.sources.get(tabId);
    if (source) {
      source.isPlaying = false;
      this.emitState();
    }
  }

  private async getMetadata(
    tabId: string,
    view?: WebContentsView,
  ): Promise<Partial<MediaSource> | null> {
    const wcv = view ?? this.ctx.getWcvForTab(tabId);
    if (!wcv || wcv.webContents.isDestroyed()) return null;
    try {
      const data = await wcv.webContents.executeJavaScript(
        `(() => {
          try {
            const ms = navigator.mediaSession;
            const findEl = () => {
              const el = document.querySelector('video,audio');
              if (el) return el;
              for (const host of document.querySelectorAll('*')) {
                if (host.shadowRoot) {
                  const found = host.shadowRoot.querySelector('video,audio');
                  if (found) return found;
                }
              }
              return null;
            };
            const el = findEl();
            const hasMeta = ms && ms.metadata != null;
            const hasSession = ms && ms.playbackState !== 'none';
            return {
              title: hasMeta ? (ms.metadata.title || document.title || '') : (document.title || ''),
              artist: hasMeta ? (ms.metadata.artist || null) : null,
              album: hasMeta ? (ms.metadata.album || null) : null,
              artworkUrl: hasMeta ? (ms.metadata.artwork?.[0]?.src || null) : null,
              hasMediaSession: !!hasSession,
              duration: el && isFinite(el.duration) && el.duration > 0 ? el.duration : null,
              currentTime: el ? el.currentTime : null,
            };
          } catch { return null; }
        })()`,
        false, // read-only — no user gesture needed
      );
      return data as Partial<MediaSource> | null;
    } catch {
      return null;
    }
  }

  private emitState(): void {
    this.ctx.events.emit('state:media-changed', {
      sources: [...this.sources.values()],
    });
  }

  async play(tabId: string): Promise<void> {
    const view = this.ctx.getWcvForTab(tabId);
    if (!view || view.webContents.isDestroyed()) {
      this.ctx.logger.warn(`[MediaSession] play: no view for tabId=${tabId}`);
      return;
    }
    const wc = view.webContents;
    // Preload bridge: let the preload script attempt play() in-context.
    wc.send('media:command', 'play');
    // executeJavaScript with userGesture:true bypasses autoplay policy.
    await wc
      .executeJavaScript(
        `(async () => {
          const el = [...document.querySelectorAll('video,audio')]
            .find(e => e.paused && e.readyState > 0) ||
            document.querySelector('video,audio');
          if (el) { try { await el.play(); } catch(e) {} }
        })()`,
        true,
      )
      .catch(() => {});
    this.ctx.logger.info(`[MediaSession] play(${tabId})`);
  }

  async pause(tabId: string): Promise<void> {
    const view = this.ctx.getWcvForTab(tabId);
    if (!view || view.webContents.isDestroyed()) {
      this.ctx.logger.warn(`[MediaSession] pause: no view for tabId=${tabId}`);
      return;
    }
    const wc = view.webContents;
    wc.send('media:command', 'pause');
    await wc
      .executeJavaScript(
        `(() => {
          [...document.querySelectorAll('video,audio')]
            .filter(e => !e.paused)
            .forEach(e => e.pause());
        })()`,
        true,
      )
      .catch(() => {});
    this.ctx.logger.info(`[MediaSession] pause(${tabId})`);
  }

  async skipNext(tabId: string): Promise<void> {
    const view = this.ctx.getWcvForTab(tabId);
    if (!view || view.webContents.isDestroyed()) {
      this.ctx.logger.warn(`[MediaSession] skipNext: no view for tabId=${tabId}`);
      return;
    }
    view.webContents.send('media:command', 'nexttrack');
    this.ctx.logger.info(`[MediaSession] skipNext(${tabId})`);
  }

  async skipPrev(tabId: string): Promise<void> {
    const view = this.ctx.getWcvForTab(tabId);
    if (!view || view.webContents.isDestroyed()) {
      this.ctx.logger.warn(`[MediaSession] skipPrev: no view for tabId=${tabId}`);
      return;
    }
    view.webContents.send('media:command', 'previoustrack');
    this.ctx.logger.info(`[MediaSession] skipPrev(${tabId})`);
  }

  async seekBy(tabId: string, delta: number): Promise<void> {
    const view = this.ctx.getWcvForTab(tabId);
    if (!view || view.webContents.isDestroyed()) return;
    const command = delta >= 0 ? 'seekforward' : 'seekbackward';
    view.webContents.send('media:command', command);
    await view.webContents
      .executeJavaScript(
        `(() => {
          const el = document.querySelector('video,audio');
          if (el && isFinite(el.duration)) {
            el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + ${delta}));
          }
        })()`,
      )
      .catch(() => {});
  }

  async getCurrentTime(tabId: string): Promise<{ currentTime: number; duration: number | null }> {
    const view = this.ctx.getWcvForTab(tabId);
    if (!view || view.webContents.isDestroyed()) {
      return { currentTime: 0, duration: null };
    }
    try {
      const data = await view.webContents.executeJavaScript(
        `(() => {
          const findEl = () => {
            const el = document.querySelector('video,audio');
            if (el) return el;
            for (const host of document.querySelectorAll('*')) {
              if (host.shadowRoot) {
                const found = host.shadowRoot.querySelector('video,audio');
                if (found) return found;
              }
            }
            return null;
          };
          const el = findEl();
          if (!el) return { currentTime: 0, duration: null };
          return {
            currentTime: el.currentTime,
            duration: isFinite(el.duration) && el.duration > 0 ? el.duration : null,
          };
        })()`,
      );
      return data as { currentTime: number; duration: number | null };
    } catch {
      return { currentTime: 0, duration: null };
    }
  }

  getSources(): MediaSource[] {
    return [...this.sources.values()];
  }

  getActiveCount(): number {
    return [...this.sources.values()].filter((s) => s.isPlaying).length;
  }
}

import type { WebContents } from 'electron';
import type { Logger } from '../logger';
import type { PreviewStore } from './PreviewStore';

export interface CaptureSettings {
  enabled: boolean;
  width: number;
  height: number;
  quality: number;
}

export class PreviewCapturer {
  private readonly lastCaptureAt = new Map<string, number>();
  private readonly queue: Array<() => Promise<void>> = [];
  private processing = false;

  constructor(
    private readonly store: PreviewStore,
    private readonly logger: Logger,
    private readonly getSettings: () => CaptureSettings,
  ) {}

  getStore(): PreviewStore {
    return this.store;
  }

  async capture(
    tabId: string,
    webContents: WebContents,
  ): Promise<void> {
    const settings = this.getSettings();
    if (!settings.enabled) return;

    const now = Date.now();
    const last = this.lastCaptureAt.get(tabId) ?? 0;
    if (now - last < 5000) return;

    return new Promise((resolve) => {
      this.queue.push(async () => {
        try {
          await this.doCapture(tabId, webContents, settings);
        } catch (e) {
          this.logger.warn(`[preview] capture failed tab=${tabId}: ${e}`);
        }
        resolve();
      });
      void this.processQueue();
    });
  }

  private async doCapture(
    tabId: string,
    webContents: WebContents,
    settings: CaptureSettings,
  ): Promise<void> {
    if (webContents.isDestroyed()) return;

    const image = await webContents.capturePage();
    if (webContents.isDestroyed()) return;

    const resized = image.resize({ width: settings.width, height: settings.height });
    const buffer = resized.toJPEG(settings.quality);

    await this.store.save(tabId, buffer);
    this.lastCaptureAt.set(tabId, Date.now());
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      await task();
    }
    this.processing = false;
  }

  clearThrottle(tabId: string): void {
    this.lastCaptureAt.delete(tabId);
  }
}

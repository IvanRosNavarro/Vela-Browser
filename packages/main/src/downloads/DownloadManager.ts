import path from 'node:path';
import { app, BrowserWindow, type Session } from 'electron';
import { IPC_EVENTS } from '@vela/shared';
import type { DownloadItem as DlItem } from '@vela/shared';
import type { MainEventBus } from '../ipc/events';
import type { Logger } from '../logger';

function generateId(): string {
  return crypto.randomUUID();
}

export class DownloadManager {
  private items = new Map<string, DlItem>();
  private electronItems = new Map<string, Electron.DownloadItem>();
  private readonly events: MainEventBus;
  private readonly logger: Logger;
  private lastDownloadDir: string = app.getPath('downloads');

  constructor(events: MainEventBus, logger: Logger) {
    this.events = events;
    this.logger = logger;
  }

  attachToSession(session: Session, profileId: string): void {
    session.on('will-download', (_event, item) => {
      const id = generateId();

      const defaultSavePath = path.join(
        this.lastDownloadDir,
        item.getFilename(),
      );
      item.setSavePath(defaultSavePath);

      const dl: DlItem = {
        id,
        filename: item.getFilename(),
        url: item.getURL(),
        savePath: defaultSavePath,
        totalBytes: item.getTotalBytes(),
        receivedBytes: 0,
        state: 'progressing',
        startedAt: Date.now(),
        completedAt: null,
        mimeType: item.getMimeType(),
        paused: false,
      };

      this.items.set(id, dl);
      this.electronItems.set(id, item);
      this.emit();

      item.on('updated', (_e, state) => {
        const d = this.items.get(id);
        if (!d) return;
        d.receivedBytes = item.getReceivedBytes();
        d.totalBytes = item.getTotalBytes();
        d.paused = item.isPaused();
        d.state = state === 'interrupted' ? 'interrupted' : 'progressing';
        this.emit();
      });

      item.once('done', (_e, state) => {
        const d = this.items.get(id);
        if (!d) return;
        d.state = state as DlItem['state'];
        d.receivedBytes = item.getReceivedBytes();
        d.totalBytes = item.getTotalBytes();
        d.completedAt = Date.now();
        d.savePath = item.getSavePath();
        if (state === 'completed') {
          this.lastDownloadDir = path.dirname(d.savePath);
        }
        this.electronItems.delete(id);
        this.emit();
        this.logger.info(`[downloads] ${state}: ${d.filename}`);
      });

      this.logger.info(`[downloads] start: ${dl.filename} (profile ${profileId})`);
    });
  }

  pause(id: string): void {
    this.electronItems.get(id)?.pause();
    const d = this.items.get(id);
    if (d) { d.paused = true; this.emit(); }
  }

  resume(id: string): void {
    this.electronItems.get(id)?.resume();
    const d = this.items.get(id);
    if (d) { d.paused = false; this.emit(); }
  }

  cancel(id: string): void {
    this.electronItems.get(id)?.cancel();
    // state update via 'done' event
  }

  remove(id: string): void {
    this.items.delete(id);
    this.electronItems.delete(id);
    this.emit();
  }

  clearCompleted(): void {
    for (const [id, item] of this.items) {
      if (item.state !== 'progressing') {
        this.items.delete(id);
        this.electronItems.delete(id);
      }
    }
    this.emit();
  }

  getAll(): DlItem[] {
    return [...this.items.values()].sort((a, b) => b.startedAt - a.startedAt);
  }

  getActive(): DlItem[] {
    return this.getAll().filter((d) => d.state === 'progressing');
  }

  private emit(): void {
    const items = this.getAll();
    // Push to all renderer windows
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(IPC_EVENTS.DOWNLOADS_CHANGED, { items });
      }
    }
  }
}

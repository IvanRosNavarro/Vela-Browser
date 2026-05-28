import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { createWriteStream } from 'node:fs';
import { createRequire } from 'node:module';
const _require = createRequire(import.meta.url);
const _archiver = _require('archiver') as typeof import('archiver');
import type { TabManager } from '../tabs/TabManager';
import type { Logger } from '../logger';

interface ConsoleEntry {
  level: string;
  message: string;
  line?: number;
  sourceId?: string;
  stack?: string;
  timestamp: number;
}

const MAX_ENTRIES = 500;
const buffers = new Map<number, ConsoleEntry[]>();
let initialized = false;

export function initConsoleBuffers(): void {
  if (initialized) return;
  initialized = true;
  app.on('web-contents-created', (_, wc) => {
    buffers.set(wc.id, []);
    wc.on('console-message', (ev) => {
      const buf = buffers.get(wc.id);
      if (!buf) return;
      const { level, message, lineNumber, sourceId } = ev;
      buf.push({ level, message, timestamp: Date.now(), line: lineNumber, sourceId });
      if (buf.length > MAX_ENTRIES) buf.shift();
    });
    wc.on('destroyed', () => buffers.delete(wc.id));
  });
}

export class BugSnapshotService {
  constructor(
    private readonly tabManager: TabManager,
    private readonly logger: Logger,
  ) {}

  async capture(tabId: string, windowId: number, includeNetwork: boolean): Promise<string> {
    const wcv = this.tabManager.getWcvForTab(tabId);
    if (!wcv || wcv.webContents.isDestroyed()) {
      throw new Error('Tab no disponible para captura');
    }
    const wc = wcv.webContents;
    const win = BrowserWindow.fromId(windowId);

    const snapshotJson = {
      url: wc.getURL(),
      timestamp: new Date().toISOString(),
      resolution: win ? { width: win.getBounds().width, height: win.getBounds().height } : null,
      userAgent: wc.getUserAgent(),
      velaVersion: app.getVersion(),
      platform: process.platform,
      electronVersion: process.versions.electron,
    };

    const domHtml = await wc.executeJavaScript(
      'document.documentElement.outerHTML',
      false,
    ) as string;

    // Merge console entries: main-process captured (reliable) + preload buffer (stack traces)
    const mainEntries = [...(buffers.get(wc.id) ?? [])];
    let preloadEntries: ConsoleEntry[] = [];
    try {
      preloadEntries = await wc.executeJavaScript(
        'window.velaApi?.bugSnapshot?.getConsoleBuffer() ?? []',
        false,
      ) as ConsoleEntry[];
    } catch { /* preload buffer unavailable */ }
    const mainSet = new Set(mainEntries.map((e) => `${e.timestamp}:${e.message}`));
    const merged = [
      ...mainEntries,
      ...preloadEntries.filter((e) => !mainSet.has(`${e.timestamp}:${e.message}`)),
    ].sort((a, b) => a.timestamp - b.timestamp);

    const screenshotJpeg = (await wc.capturePage()).toJPEG(85);

    let networkData: unknown[] = [];
    if (includeNetwork) {
      try {
        networkData = await wc.executeJavaScript(
          `performance.getEntriesByType('resource').slice(-50).map(e => ({
            url: e.name,
            duration: Math.round(e.duration),
            size: e.transferSize,
            type: e.initiatorType,
          }))`,
          false,
        ) as unknown[];
      } catch { /* skip network */ }
    }

    const downloadsDir = app.getPath('downloads');
    let domain = 'unknown';
    try {
      domain = new URL(wc.getURL()).hostname.replace(/[^a-zA-Z0-9.-]/g, '_') || 'unknown';
    } catch { /* invalid URL */ }
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipPath = join(downloadsDir, `bug-snapshot-${domain}-${ts}.zip`);

    await this._createZip(zipPath, {
      'snapshot.json': Buffer.from(JSON.stringify(snapshotJson, null, 2)),
      'dom.html': Buffer.from(domHtml),
      'console.json': Buffer.from(JSON.stringify(merged, null, 2)),
      'screenshot.jpg': screenshotJpeg,
      'network.json': Buffer.from(JSON.stringify(networkData, null, 2)),
    });

    this.logger.info('[bug-snapshot] Snapshot guardado', { zipPath });
    return zipPath;
  }

  private _createZip(zipPath: string, files: Record<string, Buffer>): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = _archiver('zip', { zlib: { level: 6 } });
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      for (const [name, content] of Object.entries(files)) {
        archive.append(content, { name });
      }
      void archive.finalize();
    });
  }
}

import path from 'node:path';
import fs from 'node:fs';
import { BrowserWindow, WebContentsView, screen } from 'electron';
import type { TabManager } from '../tabs/TabManager';
import type { AppMetadataRepository } from '../storage/repositories/AppMetadataRepository';
import type { Logger } from '../logger';
import type { GlanceAnchorRect, PanelId } from '@vela/shared';

const INTERNAL_PRELOAD_PATH = path.join(__dirname, '../../preload/dist/index.js');

const TOOLBAR_HEIGHT = 38;
const SCROLL_CACHE_LIMIT = 100;

export class GlanceManager {
  private activeWindow: BrowserWindow | null = null;
  private activeWcv: WebContentsView | null = null;
  private activeUrl: string | null = null;
  private scrollCache = new Map<string, number>();

  constructor(
    private readonly tabManager: TabManager,
    private readonly appMetadata: AppMetadataRepository,
    private readonly logger: Logger,
  ) {}

  private getSetting<T>(key: string, defaultValue: T): T {
    try {
      const raw = this.appMetadata.get(key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  }

  isEnabled(): boolean {
    return this.getSetting<boolean>('glance:enabled', true);
  }

  getModifier(): 'ctrl' | 'shift' {
    const v = this.getSetting<string>('glance:modifier', 'ctrl');
    return v === 'shift' ? 'shift' : 'ctrl';
  }

  getWidth(): number {
    const v = this.getSetting<number>('glance:width', 640);
    return Math.min(1920, Math.max(480, v));
  }

  getHeight(): number {
    const v = this.getSetting<number>('glance:height', 400);
    return Math.min(1440, Math.max(300, v));
  }

  checkModifiers(modifiers: { alt: boolean; ctrl: boolean; shift: boolean; meta: boolean }): boolean {
    const modifier = this.getModifier();
    if (modifier === 'shift') return modifiers.shift && !modifiers.ctrl && !modifiers.meta;
    // 'ctrl': Ctrl on Windows/Linux, Cmd (meta) on macOS
    return process.platform === 'darwin'
      ? (modifiers.meta && !modifiers.shift)
      : (modifiers.ctrl && !modifiers.shift);
  }

  async show(
    parentWindowId: number,
    url: string,
    anchorRect: GlanceAnchorRect,
    modifiers: { alt: boolean; ctrl: boolean; shift: boolean; meta: boolean },
  ): Promise<void> {
    if (!this.isEnabled()) return;
    if (!this.checkModifiers(modifiers)) return;

    await this.hide();

    const parentWindow = BrowserWindow.fromId(parentWindowId);
    if (!parentWindow || parentWindow.isDestroyed()) return;

    const width = this.getWidth();
    const height = this.getHeight();

    // Center on the display that contains the parent window.
    const pos = parentWindow.getPosition();
    const display = screen.getDisplayNearestPoint({ x: pos[0] ?? 0, y: pos[1] ?? 0 });
    const db = display.bounds;
    const x = Math.round(db.x + (db.width - width) / 2);
    const y = Math.round(db.y + (db.height - height) / 2);

    const preloadExists = fs.existsSync(INTERNAL_PRELOAD_PATH);

    this.activeWindow = new BrowserWindow({
      width,
      height,
      x,
      y,
      frame: false,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      roundedCorners: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        ...(preloadExists ? { preload: INTERNAL_PRELOAD_PATH } : {}),
      },
    });

    // Use the active tab's profile session so cookies and cache are available.
    // Falls back to the profile session directly if no active tab is found.
    const profileSession = this.tabManager.getActiveTabSession(parentWindowId);

    this.activeWcv = new WebContentsView({
      webPreferences: {
        ...(profileSession ? { session: profileSession } : {}),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    this.activeWindow.contentView.addChildView(this.activeWcv);
    this.activeWcv.setBounds({ x: 0, y: TOOLBAR_HEIGHT, width, height: height - TOOLBAR_HEIGHT });

    this.activeUrl = url;
    void this.activeWcv.webContents.loadURL(url).catch(() => {});

    // Restore scroll position if this URL was previously scrolled in Glance.
    const savedScroll = this.scrollCache.get(url) ?? 0;
    if (savedScroll > 0) {
      const capturedWcv = this.activeWcv;
      this.activeWcv.webContents.once('did-finish-load', () => {
        if (capturedWcv && !capturedWcv.webContents.isDestroyed()) {
          void capturedWcv.webContents.executeJavaScript(`window.scrollTo(0,${savedScroll})`).catch(() => {});
        }
      });
    }

    const glanceUrl = new URL('vela://glance');
    glanceUrl.searchParams.set('url', url);
    glanceUrl.searchParams.set('windowId', String(parentWindowId));

    try {
      await this.activeWindow.loadURL(glanceUrl.toString());
    } catch {
      // Window may have been destroyed before loading finished.
      return;
    }

    if (!this.activeWindow || this.activeWindow.isDestroyed()) return;

    this.activeWindow.show();

    const capturedWin = this.activeWindow;

    this.activeWindow.on('blur', () => void this.hide());

    this.activeWindow.once('closed', () => {
      if (this.activeWindow === capturedWin) {
        this.activeWcv = null;
        this.activeWindow = null;
      }
    });
  }

  async hide(): Promise<void> {
    const wcv = this.activeWcv;
    const win = this.activeWindow;
    const url = this.activeUrl;
    this.activeWcv = null;
    this.activeWindow = null;
    this.activeUrl = null;

    // Capture scroll position before destroying so it can be restored next time.
    if (wcv && !wcv.webContents.isDestroyed() && url) {
      try {
        const scrollY = await wcv.webContents.executeJavaScript('window.scrollY') as number;
        if (typeof scrollY === 'number' && scrollY > 0) {
          this.scrollCache.set(url, scrollY);
          if (this.scrollCache.size > SCROLL_CACHE_LIMIT) {
            const oldest = this.scrollCache.keys().next().value as string;
            this.scrollCache.delete(oldest);
          }
        }
      } catch { /* webContents may have been destroyed */ }
    }

    if (win && !win.isDestroyed()) {
      win.destroy();
    }
  }

  async openInTab(parentWindowId: number, url: string): Promise<void> {
    await this.hide();

    const workspaceId = this.tabManager.getWorkspaceForWindow(parentWindowId);
    if (!workspaceId) return;

    const layout = this.tabManager.getWindowLayoutData(parentWindowId);
    const panelId = layout.focusedPanelId;

    try {
      await this.tabManager.createTab(parentWindowId, {
        workspaceId,
        parentId: null,
        url,
        activate: true,
        panelId,
      });
    } catch (err) {
      this.logger.warn('[glance] openInTab: createTab falló', err);
    }
  }

  async openInSplit(parentWindowId: number, url: string): Promise<void> {
    await this.hide();

    const workspaceId = this.tabManager.getWorkspaceForWindow(parentWindowId);
    if (!workspaceId) return;

    const layout = this.tabManager.getWindowLayoutData(parentWindowId);

    let secondPanelId: PanelId;
    if (layout.mode === 'single') {
      // Activate horizontal split — creates a blank tab in the secondary panel.
      await this.tabManager.setSplit(parentWindowId, 'split-h');
      secondPanelId = 'right';
    } else {
      // Already split: open in whichever panel is not focused.
      const other = layout.panels.find(p => p.panelId !== layout.focusedPanelId);
      secondPanelId = other?.panelId ?? layout.focusedPanelId;
    }

    try {
      await this.tabManager.createTab(parentWindowId, {
        workspaceId,
        parentId: null,
        url,
        activate: true,
        panelId: secondPanelId,
      });
    } catch (err) {
      this.logger.warn('[glance] openInSplit: createTab falló', err);
    }
  }
}

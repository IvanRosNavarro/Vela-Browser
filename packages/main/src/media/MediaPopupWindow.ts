import path from 'node:path';
import fs from 'node:fs';
import { BrowserWindow } from 'electron';
import type { Logger } from '../logger';

const INTERNAL_PRELOAD_PATH = path.join(__dirname, '../../preload/dist/index.js');

export const MEDIA_POPUP_WIDTH = 300;
const MEDIA_POPUP_HEIGHT = 420;
const BLUR_DEBOUNCE_MS = 150;

export class MediaPopupWindow {
  private win: BrowserWindow | null = null;
  private lastHiddenAt = 0;

  constructor(private readonly logger: Logger) {}

  toggle(x: number, y: number): void {
    const sinceHidden = Date.now() - this.lastHiddenAt;
    if (sinceHidden < BLUR_DEBOUNCE_MS) {
      // Popup was just hidden by blur triggered by clicking our button — don't re-show
      return;
    }
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.hide();
      return;
    }
    this.show(x, y);
  }

  show(x: number, y: number): void {
    if (!this.win || this.win.isDestroyed()) {
      this.createWindow();
    }
    const win = this.win!;
    win.setPosition(Math.round(x), Math.round(y));

    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', () => {
        win.show();
        win.focus();
      });
    } else {
      win.show();
      win.focus();
    }
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.hide();
    }
    this.lastHiddenAt = Date.now();
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.destroy();
    }
    this.win = null;
  }

  private createWindow(): void {
    const preloadExists = fs.existsSync(INTERNAL_PRELOAD_PATH);

    this.win = new BrowserWindow({
      width: MEDIA_POPUP_WIDTH,
      height: MEDIA_POPUP_HEIGHT,
      x: 0,
      y: 0,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        ...(preloadExists ? { preload: INTERNAL_PRELOAD_PATH } : {}),
      },
    });

    void this.win.loadURL('vela://media-popup').catch(() => {});

    const capturedWin = this.win;
    this.win.on('blur', () => {
      if (this.win === capturedWin) this.hide();
    });
    this.win.once('closed', () => {
      if (this.win === capturedWin) this.win = null;
    });

    this.logger.info('[MediaPopupWindow] created');
  }
}

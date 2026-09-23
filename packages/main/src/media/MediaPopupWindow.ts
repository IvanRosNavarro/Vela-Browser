import path from 'node:path';
import fs from 'node:fs';
import { BrowserWindow, screen } from 'electron';
import type { Logger } from '../logger';

const INTERNAL_PRELOAD_PATH = path.join(__dirname, '../../preload/dist/index.js');

export const MEDIA_POPUP_WIDTH = 300;
const BLUR_DEBOUNCE_MS = 150;

/**
 * Alto de arranque mientras la página no ha medido su contenido: cabecera más
 * una estimación por fuente. Nunca es la altura final — en cuanto el popup
 * pinta, pide el alto exacto por `media:resize-popup`.
 */
const HEADER_HEIGHT = 33;
const ROW_ESTIMATE = 150;
const MIN_HEIGHT = 80;

export function estimateHeight(itemCount: number): number {
  return Math.max(MIN_HEIGHT, HEADER_HEIGHT + Math.max(itemCount, 1) * ROW_ESTIMATE);
}

export class MediaPopupWindow {
  private win: BrowserWindow | null = null;
  private lastHiddenAt = 0;
  /** Esquina superior derecha pedida, para recolocar al cambiar de alto. */
  private anchor: { x: number; y: number } | null = null;
  private profileId: string | null = null;

  constructor(private readonly logger: Logger) {}

  private popupUrl(profileId: string): string {
    return `vela://media-popup?profileId=${encodeURIComponent(profileId)}`;
  }

  toggle(x: number, y: number, itemCount: number, profileId: string): void {
    const sinceHidden = Date.now() - this.lastHiddenAt;
    if (sinceHidden < BLUR_DEBOUNCE_MS) {
      // El blur lo ha provocado el clic en nuestro propio botón: no reabrir.
      return;
    }
    if (this.win && !this.win.isDestroyed() && this.win.isVisible()) {
      this.hide();
      return;
    }
    this.show(x, y, itemCount, profileId);
  }

  show(x: number, y: number, itemCount: number, profileId: string): void {
    const height = estimateHeight(itemCount);
    if (!this.win || this.win.isDestroyed()) {
      this.createWindow(height, profileId);
    } else if (profileId !== this.profileId) {
      // La ventana se reutiliza entre aperturas; si el perfil activo ha
      // cambiado hay que recargarla o seguiría filtrando por el anterior.
      this.profileId = profileId;
      void this.win.loadURL(this.popupUrl(profileId)).catch(() => {});
    }
    const win = this.win!;
    this.anchor = { x, y };
    win.setBounds({ ...this.placement(height), width: MEDIA_POPUP_WIDTH, height });

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

  /** Alto exacto que pide el propio popup una vez pintado su contenido. */
  resize(height: number): void {
    if (!this.win || this.win.isDestroyed()) return;
    const clamped = Math.max(MIN_HEIGHT, Math.round(height));
    const bounds = this.win.getBounds();
    if (bounds.height === clamped) return;
    this.win.setBounds({ ...this.placement(clamped), width: MEDIA_POPUP_WIDTH, height: clamped });
  }

  /** Mantiene el popup pegado a su ancla y dentro de la pantalla. */
  private placement(height: number): { x: number; y: number } {
    const anchor = this.anchor ?? { x: 0, y: 0 };
    const area = screen.getDisplayNearestPoint(anchor).workArea;
    const x = Math.min(Math.max(anchor.x, area.x), area.x + area.width - MEDIA_POPUP_WIDTH);
    const y = Math.min(Math.max(anchor.y, area.y), area.y + area.height - height);
    return { x: Math.round(x), y: Math.round(y) };
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

  private createWindow(height: number, profileId: string): void {
    const preloadExists = fs.existsSync(INTERNAL_PRELOAD_PATH);

    this.win = new BrowserWindow({
      width: MEDIA_POPUP_WIDTH,
      height,
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

    // El perfil viaja en la URL: el popup solo lista lo que suena en la ventana
    // desde la que se abrió, no lo de los demás perfiles.
    this.profileId = profileId;
    void this.win.loadURL(this.popupUrl(profileId)).catch(() => {});

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

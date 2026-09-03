import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '@vela/shared';
import {
  createPopupWindow,
  clampToDisplay,
  type GlassParams,
  applyGlassUrlParams,
} from '../ipc/popupUtils';
import type { IpcContext } from '../ipc/context';
import type { TranslationResult as BaseTranslationResult } from './TranslationManager';

export interface FullTranslationResult extends BaseTranslationResult {
  sourceLang: string;
  targetLang: string;
  originalText: string;
}

const POPUP_WIDTH = 380;
// Altura inicial aproximada; sendResize la corregirá tras el primer render.
// Incluye 16px de padding del #root (8px arriba + 8px abajo) para la sombra.
const COMPACT_HEIGHT = 180;

type ReposWithSettings = { settings: { get(key: string): string | null | undefined } };

function readGlass(repos: ReposWithSettings): GlassParams | null {
  if (repos.settings.get('ui:glassmorphism') !== 'true') return null;
  const intensity = Number(repos.settings.get('ui:glassmorphism-intensity') ?? 60);
  const opacity = Number(repos.settings.get('ui:glassmorphism-opacity') ?? 60);
  return {
    blurPx: Math.round(16 + (intensity / 100) * 8),
    bgOpacity: parseFloat((0.20 + (opacity / 100) * 0.65).toFixed(2)),
  };
}

const CONFIRM_WIDTH = 380;
const CONFIRM_HEIGHT = 290;

export class TranslationPopup {
  private readonly popups = new Map<number, BrowserWindow>();
  private readonly confirmPopups = new Map<number, BrowserWindow>();

  constructor(private readonly ctx: IpcContext) {
    ipcMain.handle(IPC_CHANNELS.TRANSLATE_RESIZE_POPUP, (_event, payload) => {
      const { windowId, height } = payload as { windowId: number; height: number };
      const popup = this.popups.get(windowId);
      if (!popup || popup.isDestroyed()) return;
      const newH = Math.max(80, Math.min(height, 700));
      const pos = popup.getPosition();
      const sz = popup.getSize();
      const cx = pos[0]!;
      const cy = pos[1]!;
      const ch = sz[1]!;
      // Mantener el borde inferior fijo: mover Y hacia arriba cuando crece
      const newY = cy - (newH - ch);
      const { x, y } = clampToDisplay(cx, newY, POPUP_WIDTH, newH);
      popup.setBounds({ x, y, width: POPUP_WIDTH, height: newH }, false);
    });

    ipcMain.handle(IPC_CHANNELS.TRANSLATE_COPY_AND_CLOSE, (_event, payload) => {
      const { windowId } = payload as { windowId: number };
      this.close(windowId);
    });
  }

  show(windowId: number, result: FullTranslationResult, glass: GlassParams | null): void {
    const parentWin = BrowserWindow.fromId(windowId);
    if (!parentWin || parentWin.isDestroyed()) return;

    const existing = this.popups.get(windowId);
    if (existing && !existing.isDestroyed()) {
      // Recycle: send new data to the existing popup
      const url = this.buildUrl(windowId, result, glass);
      void existing.loadURL(url).catch(() => { /* popup cerrado a media carga */ });
      existing.show();
      existing.focus();
      return;
    }

    const { x, y } = this.calcPosition(parentWin, windowId);

    const popup = createPopupWindow({
      width: POPUP_WIDTH,
      height: COMPACT_HEIGHT,
      x,
      y,
      // Ventana transparente: solo la tarjeta CSS es visible (sin fondo de BrowserWindow)
      transparent: true,
      backgroundColor: '#00000000',
      ...(glass ? { glassmorphism: glass } : {}),
    });

    this.popups.set(windowId, popup);
    this.ctx.profileWindowManager.registerAuxiliaryWindow(
      popup.id,
      this.ctx.tabManager.getProfileForWindow(windowId) ?? '',
    );

    popup.on('closed', () => {
      this.ctx.profileWindowManager.unregisterAuxiliaryWindow(popup.id);
      if (this.popups.get(windowId) === popup) {
        this.popups.delete(windowId);
      }
    });

    parentWin.on('close', () => {
      if (!popup.isDestroyed()) popup.close();
    });

    const url = this.buildUrl(windowId, result, glass);
    void popup
      .loadURL(url)
      .then(() => {
        if (!popup.isDestroyed()) popup.show();
      })
      .catch(() => {
        if (!popup.isDestroyed()) popup.close();
      });
  }

  close(windowId: number): void {
    const popup = this.popups.get(windowId);
    if (popup && !popup.isDestroyed()) popup.close();
  }

  closeAll(): void {
    for (const [, popup] of this.popups) {
      if (!popup.isDestroyed()) popup.close();
    }
    this.popups.clear();
  }

  private calcPosition(parentWin: BrowserWindow, windowId: number): { x: number; y: number } {
    const wPos = parentWin.getPosition();
    const wSz = parentWin.getSize();
    const winX = wPos[0]!;
    const winY = wPos[1]!;
    const winW = wSz[0]!;
    const winH = wSz[1]!;
    const layout = this.ctx.tabManager.getWindowLayout(windowId);
    const sidebarW = layout?.sidebarWidth ?? 0;
    const addressBarH = layout?.addressBarHeight ?? 40;

    const contentRight = winX + winW;
    const contentBottom = winY + winH;

    const rawX = contentRight - POPUP_WIDTH - 16;
    const rawY = contentBottom - COMPACT_HEIGHT - 16;

    return clampToDisplay(rawX, rawY, POPUP_WIDTH, COMPACT_HEIGHT);
  }

  private buildUrl(windowId: number, result: FullTranslationResult, glass: GlassParams | null): string {
    const url = new URL('vela://translate-result');
    url.searchParams.set('windowId', String(windowId));
    url.searchParams.set('translatedText', result.translatedText);
    url.searchParams.set('detectedLang', result.detectedLang);
    url.searchParams.set('sourceLang', result.sourceLang);
    url.searchParams.set('targetLang', result.targetLang);
    url.searchParams.set('originalText', result.originalText);
    if (glass) applyGlassUrlParams(url, glass);
    return url.toString();
  }

  closeConfirmPopup(windowId: number): void {
    const popup = this.confirmPopups.get(windowId);
    if (popup && !popup.isDestroyed()) popup.close();
  }

  registerConfirmPopup(ctx: IpcContext): void {
    ipcMain.handle(IPC_CHANNELS.TRANSLATE_CONFIRM_OPEN, async (_event, payload): Promise<void> => {
      const { windowId } = payload as { windowId: number };
      const parentWin = BrowserWindow.fromId(windowId);
      if (!parentWin || parentWin.isDestroyed()) return;

      // Si ya hay un popup abierto, enfocarlo
      const existing = this.confirmPopups.get(windowId);
      if (existing && !existing.isDestroyed()) { existing.focus(); return; }

      const wPos = parentWin.getPosition();
      const wSz = parentWin.getSize();
      const rawX = wPos[0]! + Math.floor((wSz[0]! - CONFIRM_WIDTH) / 2);
      const rawY = wPos[1]! + Math.floor((wSz[1]! - CONFIRM_HEIGHT) / 2);
      const { x, y } = clampToDisplay(rawX, rawY, CONFIRM_WIDTH, CONFIRM_HEIGHT);

      const activeTabId = ctx.tabManager.getActiveTabId(windowId) ?? '';
      const profileId = ctx.profileWindowManager.getProfileForWindow(windowId);
      let glass: GlassParams | null = null;
      if (profileId) glass = readGlass(ctx.profileManager.getRepositories(profileId));

      const popup = createPopupWindow({
        width: CONFIRM_WIDTH,
        height: CONFIRM_HEIGHT,
        x,
        y,
        transparent: true,
        backgroundColor: '#00000000',
        ...(glass ? { glassmorphism: glass } : {}),
      });

      this.confirmPopups.set(windowId, popup);
      ctx.profileWindowManager.registerAuxiliaryWindow(popup.id, profileId ?? '');

      popup.on('blur', () => { if (!popup.isDestroyed()) popup.close(); });
      popup.on('closed', () => {
        ctx.profileWindowManager.unregisterAuxiliaryWindow(popup.id);
        if (this.confirmPopups.get(windowId) === popup) this.confirmPopups.delete(windowId);
      });
      parentWin.on('close', () => { if (!popup.isDestroyed()) popup.close(); });

      const url = new URL('vela://translate-confirm');
      url.searchParams.set('windowId', String(windowId));
      url.searchParams.set('tabId', activeTabId);
      if (glass) applyGlassUrlParams(url, glass);

      await popup.loadURL(url.toString());
      if (!popup.isDestroyed()) popup.show();
    });
  }

  static readGlass = readGlass;
}

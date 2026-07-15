import fs from 'node:fs';
import path from 'node:path';
import { platform } from 'node:process';
import { BrowserWindow, screen } from 'electron';
import type { IpcContext } from './context';

const INTERNAL_PRELOAD_PATH = path.join(__dirname, '../../preload/dist/index.js');

export function getPreloadPath(): string | undefined {
  return fs.existsSync(INTERNAL_PRELOAD_PATH) ? INTERNAL_PRELOAD_PATH : undefined;
}

export function clampToDisplay(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const display = screen.getDisplayNearestPoint({ x, y });
  const { bounds } = display;
  return {
    x: Math.max(bounds.x + 4, Math.min(x, bounds.x + bounds.width - w - 4)),
    y: Math.max(bounds.y + 4, Math.min(y, bounds.y + bounds.height - h - 4)),
  };
}

/** Centra un popup de `w`×`h` sobre `parentWin`, ajustado a la pantalla donde
 *  esté esa ventana. Para diálogos modales (p. ej. selección de certificado
 *  cliente), a diferencia de los popups anclados a un botón. */
export function centerOverWindow(parentWin: BrowserWindow, w: number, h: number): { x: number; y: number } {
  const bounds = parentWin.getBounds();
  const x = bounds.x + Math.round((bounds.width - w) / 2);
  const y = bounds.y + Math.round((bounds.height - h) / 2);
  return clampToDisplay(x, y, w, h);
}

export interface GlassParams {
  blurPx: number;
  bgOpacity: number;
}

export interface VelaPopupOptions {
  width: number;
  height: number;
  x: number;
  y: number;
  roundedCorners?: boolean;
  focusable?: boolean;
  transparent?: boolean;
  parent?: BrowserWindow;
  /** Diálogo modal sobre `parent` (requiere `parent`). No se cierra por blur;
   *  usar cuando la decisión es puntual y no debe descartarse por un clic
   *  accidental fuera del popup (p. ej. selección de certificado cliente). */
  modal?: boolean;
  backgroundColor?: string;
  glassmorphism?: GlassParams;
}

export function applyGlassUrlParams(url: URL, glass: GlassParams): void {
  url.searchParams.set('glass', '1');
  url.searchParams.set('blurPx', String(glass.blurPx));
  url.searchParams.set('bgOpacity', String(glass.bgOpacity));
}

export function applyNativeMaterial(win: BrowserWindow): void {
  if (platform === 'win32') {
    try {
      (win as unknown as { setBackgroundMaterial(m: string): void }).setBackgroundMaterial('acrylic');
    } catch { /* older Windows — sin efecto nativo */ }
  } else if (platform === 'darwin') {
    win.setVibrancy('popover' as Parameters<typeof win.setVibrancy>[0]);
  }
}

export function createPopupWindow(opts: VelaPopupOptions): BrowserWindow {
  const preloadPath = getPreloadPath();
  const {
    width, height, x, y,
    roundedCorners = true,
    focusable = true,
    parent,
    modal = false,
    glassmorphism,
  } = opts;

  // Cuando hay glassmorphism, la ventana es transparente para que el material
  // nativo o el CSS backdrop-filter actúen sobre el contenido inferior.
  const transparent = glassmorphism != null ? true : (opts.transparent ?? false);
  const backgroundColor = glassmorphism != null ? '#00000000' : (opts.backgroundColor ?? '#1c1f26');

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    ...(roundedCorners ? { roundedCorners: true } : {}),
    ...(!focusable ? { focusable: false } : {}),
    ...(transparent ? { transparent: true } : {}),
    ...(parent ? { parent } : {}),
    ...(modal && parent ? { modal: true } : {}),
    backgroundColor,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      ...(preloadPath ? { preload: preloadPath } : {}),
    },
  });

  if (glassmorphism) applyNativeMaterial(win);

  return win;
}

export interface PopupLifecycleOptions {
  registry: Map<number, BrowserWindow>;
  parentWindowId: number;
  profileId: string;
  ctx: IpcContext;
  closeOnBlur?: boolean;
}

export function wirePopupLifecycle(popup: BrowserWindow, opts: PopupLifecycleOptions): void {
  const { registry, parentWindowId, profileId, ctx, closeOnBlur = true } = opts;

  registry.set(parentWindowId, popup);
  ctx.profileWindowManager.registerAuxiliaryWindow(popup.id, profileId);

  if (closeOnBlur) {
    popup.on('blur', () => {
      if (!popup.isDestroyed()) popup.close();
    });
  }

  popup.on('closed', () => {
    ctx.profileWindowManager.unregisterAuxiliaryWindow(popup.id);
    if (registry.get(parentWindowId) === popup) {
      registry.delete(parentWindowId);
    }
  });
}

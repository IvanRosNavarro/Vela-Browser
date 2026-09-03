import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, screen } from 'electron';
import type { IpcContext } from './context';

const PRELOAD_PATH = path.join(__dirname, '../../preload/dist/index.js');
const EDGE_THRESHOLD = 20;  // px desde el borde izquierdo para mostrar
const POLL_INTERVAL = 60;   // ms
const CLOSE_DELAY = 1500;   // ms cuando el cursor sale del área del sidebar (no hacia el WCV)
const WCV_CLOSE_DELAY = 300; // ms cuando el cursor entra en el área del WCV

// Map<parentWindowId, floating BrowserWindow>
const floatingWindows = new Map<number, BrowserWindow>();
// Map<parentWindowId, close timer>
const closeTimers = new Map<number, ReturnType<typeof setTimeout>>();
// Set de ventanas con un timer rápido (WCV) activo — no sobreescribir con timer lento
const quickCloseSet = new Set<number>();

function getPreloadPath(): string | undefined {
  return fs.existsSync(PRELOAD_PATH) ? PRELOAD_PATH : undefined;
}

function cancelClose(windowId: number): void {
  const t = closeTimers.get(windowId);
  if (t) { clearTimeout(t); closeTimers.delete(windowId); }
  quickCloseSet.delete(windowId);
}

// Cierre lento: para cuando el cursor sale del sidebar hacia otro área (no WCV)
function scheduleClose(windowId: number): void {
  if (closeTimers.has(windowId)) return; // no sobreescribir ningún timer activo
  closeTimers.set(windowId, setTimeout(() => {
    closeTimers.delete(windowId);
    quickCloseSet.delete(windowId);
    const fw = floatingWindows.get(windowId);
    if (fw && !fw.isDestroyed()) fw.close();
  }, CLOSE_DELAY));
}

// Cierre rápido: cursor en zona WCV — cancela cualquier timer lento y arranca uno rápido
function scheduleQuickClose(windowId: number): void {
  if (quickCloseSet.has(windowId)) return; // ya hay un timer rápido corriendo
  cancelClose(windowId); // cancela posible timer lento
  quickCloseSet.add(windowId);
  closeTimers.set(windowId, setTimeout(() => {
    closeTimers.delete(windowId);
    quickCloseSet.delete(windowId);
    const fw = floatingWindows.get(windowId);
    if (fw && !fw.isDestroyed()) fw.close();
  }, WCV_CLOSE_DELAY));
}

function isCursorOverWindow(cursor: { x: number; y: number }, win: BrowserWindow): boolean {
  if (win.isDestroyed() || !win.isVisible()) return false;
  const b = win.getBounds();
  return cursor.x >= b.x && cursor.x < b.x + b.width &&
    cursor.y >= b.y && cursor.y < b.y + b.height;
}

function showFloatingSidebar(windowId: number, parentWin: BrowserWindow, ctx: IpcContext): void {
  if (floatingWindows.has(windowId)) return;
  if (parentWin.isDestroyed()) return;

  const layout = ctx.tabManager.getWindowLayout(windowId);
  if (!layout) return;

  const addrBarH = layout.addressBarHeight;
  const contentBounds = parentWin.getContentBounds();
  const sidebarWidth = 240;
  const floatH = Math.max(100, contentBounds.height - addrBarH);
  const preloadPath = getPreloadPath();

  const floatWin = new BrowserWindow({
    parent: parentWin,
    frame: false,
    transparent: true,
    focusable: true,
    skipTaskbar: true,
    show: false,
    width: sidebarWidth,
    height: floatH,
    x: contentBounds.x,
    y: contentBounds.y + addrBarH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      ...(preloadPath ? { preload: preloadPath } : {}),
    },
  });

  floatingWindows.set(windowId, floatWin);

  const profileId = ctx.profileWindowManager.getProfileForWindow(windowId);
  if (profileId) ctx.profileWindowManager.registerAuxiliaryWindow(floatWin.id, profileId);

  const reposition = (): void => {
    if (floatWin.isDestroyed() || parentWin.isDestroyed()) return;
    const newContent = parentWin.getContentBounds();
    const newLayout = ctx.tabManager.getWindowLayout(windowId);
    const newAddrH = newLayout?.addressBarHeight ?? addrBarH;
    floatWin.setBounds({
      x: newContent.x,
      y: newContent.y + newAddrH,
      width: sidebarWidth,
      height: Math.max(100, newContent.height - newAddrH),
    });
  };

  parentWin.on('move', reposition);
  parentWin.on('resize', reposition);
  parentWin.on('maximize', reposition);
  parentWin.on('unmaximize', reposition);
  parentWin.on('restore', reposition);

  floatWin.on('closed', () => {
    parentWin.off('move', reposition);
    parentWin.off('resize', reposition);
    parentWin.off('maximize', reposition);
    parentWin.off('unmaximize', reposition);
    parentWin.off('restore', reposition);
    if (profileId) ctx.profileWindowManager.unregisterAuxiliaryWindow(floatWin.id);
    floatingWindows.delete(windowId);
    cancelClose(windowId);
  });

  const activeTabId = ctx.tabManager.getActiveTabId(windowId) ?? '';
  const pageUrl = new URL('vela://sidebar-floating');
  pageUrl.searchParams.set('windowId', String(windowId));
  pageUrl.searchParams.set('activeTabId', activeTabId);
  void floatWin
    .loadURL(pageUrl.toString())
    .then(() => {
      if (!floatWin.isDestroyed()) floatWin.show();
    })
    .catch((err: unknown) => {
      ctx.logger.error('[sidebar-float] no se pudo cargar vela://sidebar-floating:', err);
      if (!floatWin.isDestroyed()) floatWin.close();
    });
}

export function registerSidebarFloatHandler(ctx: IpcContext): void {
  setInterval(() => {
    const cursor = screen.getCursorScreenPoint();

    for (const win of BrowserWindow.getAllWindows()) {
      if (win.getParentWindow() !== null) continue;
      if (win.isDestroyed() || !win.isVisible()) continue;

      const windowId = win.id;
      const layout = ctx.tabManager.getWindowLayout(windowId);
      if (!layout) continue;

      const floatWin = floatingWindows.get(windowId);

      // Si el sidebar normal se reabrió, cerrar el flotante
      if (layout.sidebarWidth !== 0) {
        if (floatWin && !floatWin.isDestroyed()) floatWin.close();
        cancelClose(windowId);
        continue;
      }

      // ── Si el flotante ya está abierto: gestionar cierre ──────────────────
      if (floatWin && !floatWin.isDestroyed()) {
        const overFloat = isCursorOverWindow(cursor, floatWin);

        // Mantener abierto si existe cualquier popup alwaysOnTop (workspace/profile dropdown,
        // menú contextual, etc.) — incluso si está cargando y aún no es visible.
        const hasPopup = BrowserWindow.getAllWindows().some((w) => {
          if (w.id === floatWin.id || w.id === win.id) return false;
          return !w.isDestroyed() && w.isAlwaysOnTop() && w.isVisible();
        });

        if (overFloat || hasPopup) {
          cancelClose(windowId);
        } else {
          // Cursor fuera del sidebar: ¿entró en el área del WCV?
          const floatBounds = floatWin.getBounds();
          const inWcvArea = cursor.x >= floatBounds.x + floatBounds.width;
          if (inWcvArea) {
            scheduleQuickClose(windowId); // cierre rápido: clic en WCV
          } else {
            scheduleClose(windowId); // cierre lento: cursor en otra zona
          }
        }
        continue;
      }

      // ── Si el flotante no está abierto: mostrar si cursor en borde izq ────
      const cb = win.getContentBounds();
      const addrH = layout.addressBarHeight;

      if (
        cursor.x >= cb.x &&
        cursor.x < cb.x + EDGE_THRESHOLD &&
        cursor.y >= cb.y + addrH &&
        cursor.y < cb.y + cb.height
      ) {
        showFloatingSidebar(windowId, win, ctx);
      }
    }
  }, POLL_INTERVAL);
}

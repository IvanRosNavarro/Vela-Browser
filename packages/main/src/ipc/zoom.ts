import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  IPC_CHANNELS,
  zoomClosePopupInputSchema,
  zoomOpenPopupInputSchema,
  zoomStepInputSchema,
  zoomTabInputSchema,
  type IpcResponse,
  type TabZoomState,
} from '@vela/shared';
import type { IpcContext } from './context';
import { getFrameContext } from './helpers';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';
import {
  applyGlassUrlParams,
  clampToDisplay,
  createPopupWindow,
  wirePopupLifecycle,
  type GlassParams,
} from './popupUtils';

const POPUP_WIDTH = 248;
const POPUP_HEIGHT = 48;

/** Popup de zoom abierto por ventana principal. */
const zoomPopups = new Map<number, BrowserWindow>();

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

const INVALID_INPUT = { ok: false, error: 'INVALID_INPUT' } as const;

/**
 * Canales del zoom de página. Solo los invoca la shell o una página vela://
 * (indicador de la barra, popup de zoom, menú de Vela): nunca una pestaña web.
 * Además, la pestaña tiene que ser del mismo perfil que la ventana que llama.
 */
export function registerZoomHandlers(ctx: IpcContext): void {
  const tabOfCallerProfile = (event: IpcMainInvokeEvent, tabId: string): boolean => {
    const { profileId } = getFrameContext(event, ctx);
    const owner = ctx.zoomManager.getProfileForTab(tabId);
    // Pestaña sin WebContents vivo (descartada): no hay nada que ampliar y
    // devolver 100 % no filtra nada.
    return owner === null || owner === profileId;
  };

  ipcMain.handle(
    IPC_CHANNELS.ZOOM_GET,
    (event, payload: unknown): IpcResponse<TabZoomState> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ZOOM_GET);
        const parsed = zoomTabInputSchema.safeParse(payload);
        if (!parsed.success) return { ...INVALID_INPUT, details: parsed.error.flatten() };
        if (!tabOfCallerProfile(event, parsed.data.tabId)) {
          return { ok: false, error: 'NOT_FOUND', details: { entity: 'Tab', id: parsed.data.tabId } };
        }
        return { ok: true, data: ctx.zoomManager.getState(parsed.data.tabId) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ZOOM_GET);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ZOOM_STEP,
    (event, payload: unknown): IpcResponse<TabZoomState> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ZOOM_STEP);
        const parsed = zoomStepInputSchema.safeParse(payload);
        if (!parsed.success) return { ...INVALID_INPUT, details: parsed.error.flatten() };
        if (!tabOfCallerProfile(event, parsed.data.tabId)) {
          return { ok: false, error: 'NOT_FOUND', details: { entity: 'Tab', id: parsed.data.tabId } };
        }
        return { ok: true, data: ctx.zoomManager.step(parsed.data.tabId, parsed.data.direction) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ZOOM_STEP);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.ZOOM_RESET,
    (event, payload: unknown): IpcResponse<TabZoomState> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ZOOM_RESET);
        const parsed = zoomTabInputSchema.safeParse(payload);
        if (!parsed.success) return { ...INVALID_INPUT, details: parsed.error.flatten() };
        if (!tabOfCallerProfile(event, parsed.data.tabId)) {
          return { ok: false, error: 'NOT_FOUND', details: { entity: 'Tab', id: parsed.data.tabId } };
        }
        return { ok: true, data: ctx.zoomManager.reset(parsed.data.tabId) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ZOOM_RESET);
      }
    },
  );

  // ── zoom:open-popup ───────────────────────────────────────────────────────
  // Popup nativo (BrowserWindow) anclado bajo el indicador de la barra: no
  // mueve el WCV ni deja ver el fondo. Se cierra por blur; un segundo clic en
  // el indicador lo cierra (toggle), como el resto de popups de la barra.
  ipcMain.handle(
    IPC_CHANNELS.ZOOM_OPEN_POPUP,
    async (event, payload: unknown): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ZOOM_OPEN_POPUP);
        const parsed = zoomOpenPopupInputSchema.safeParse(payload);
        if (!parsed.success) return { ...INVALID_INPUT, details: parsed.error.flatten() };
        const { windowId, tabId, anchorRect } = parsed.data;

        const { profileId, repos } = getFrameContext(event, ctx);
        if (ctx.profileWindowManager.getProfileForWindow(windowId) !== profileId) {
          return { ok: false, error: 'INVALID_INPUT', details: 'windowId de otro perfil' };
        }
        if (!tabOfCallerProfile(event, tabId)) {
          return { ok: false, error: 'NOT_FOUND', details: { entity: 'Tab', id: tabId } };
        }

        const parentWin = BrowserWindow.fromId(windowId);
        if (!parentWin || parentWin.isDestroyed()) return { ok: true, data: undefined };

        const existing = zoomPopups.get(windowId);
        if (existing && !existing.isDestroyed()) {
          existing.close();
          return { ok: true, data: undefined };
        }

        const glass = readGlass(repos);
        const pos = parentWin.getPosition();
        const { x, y } = clampToDisplay(
          (pos[0] ?? 0) + Math.round(anchorRect.right) - POPUP_WIDTH,
          (pos[1] ?? 0) + Math.round(anchorRect.bottom) + 6,
          POPUP_WIDTH,
          POPUP_HEIGHT,
        );

        const popup = createPopupWindow({
          width: POPUP_WIDTH,
          height: POPUP_HEIGHT,
          x,
          y,
          ...(glass ? { glassmorphism: glass } : {}),
        });
        wirePopupLifecycle(popup, { registry: zoomPopups, parentWindowId: windowId, profileId, ctx });

        const pageUrl = new URL('vela://zoom-popup');
        pageUrl.searchParams.set('windowId', String(windowId));
        pageUrl.searchParams.set('tabId', tabId);
        pageUrl.searchParams.set('factor', String(ctx.zoomManager.getZoom(tabId)));
        if (glass) applyGlassUrlParams(pageUrl, glass);

        await popup.loadURL(pageUrl.toString());
        if (!popup.isDestroyed()) popup.show();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ZOOM_OPEN_POPUP);
      }
    },
  );

  // ── zoom:close-popup ──────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.ZOOM_CLOSE_POPUP,
    (event, payload: unknown): IpcResponse<void> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.ZOOM_CLOSE_POPUP);
        const parsed = zoomClosePopupInputSchema.safeParse(payload);
        if (!parsed.success) return { ...INVALID_INPUT, details: parsed.error.flatten() };
        const popup = zoomPopups.get(parsed.data.windowId);
        if (popup && !popup.isDestroyed()) popup.close();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.ZOOM_CLOSE_POPUP);
      }
    },
  );
}

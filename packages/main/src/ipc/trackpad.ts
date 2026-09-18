import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  trackpadNavigateSchema,
  type IpcResponse,
  type TrackpadState,
} from '@vela/shared';
import type { IpcContext } from './context';

const DISABLED: TrackpadState = { enabled: false, canGoBack: false, canGoForward: false };

/**
 * Canales del swipe de trackpad. Los invoca el preload de las pestañas web,
 * así que no llevan `guardTrustedFrame`; a cambio solo atienden a un
 * WebContents que sea una pestaña del usuario, y solo pueden mover el
 * historial de esa misma pestaña (lo que la página ya puede hacer con
 * `history.back()`).
 */
export function registerTrackpadHandlers(ctx: IpcContext): void {
  const isUserTab = (wcId: number): boolean => ctx.tabManager.getTabIdForWebContents(wcId) !== null;

  ipcMain.handle(
    IPC_CHANNELS.TRACKPAD_GET_STATE,
    (event): IpcResponse<TrackpadState> => {
      const wc = event.sender;
      if (!isUserTab(wc.id) || !ctx.trackpadGestures.isNavigationEnabled()) {
        return { ok: true, data: DISABLED };
      }
      return {
        ok: true,
        data: {
          enabled: true,
          canGoBack: wc.navigationHistory.canGoBack(),
          canGoForward: wc.navigationHistory.canGoForward(),
        },
      };
    },
  );

  ipcMain.on(IPC_CHANNELS.TRACKPAD_NAVIGATE, (event, payload: unknown) => {
    const parsed = trackpadNavigateSchema.safeParse(payload);
    if (!parsed.success) return;
    const wc = event.sender;
    if (!isUserTab(wc.id) || !ctx.trackpadGestures.isNavigationEnabled()) return;
    const nav = wc.navigationHistory;
    if (parsed.data.direction === 'back') {
      if (nav.canGoBack()) nav.goBack();
    } else if (nav.canGoForward()) {
      nav.goForward();
    }
  });
}

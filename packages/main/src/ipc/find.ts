import { BrowserWindow, ipcMain, webContents as electronWebContents, type IpcMainInvokeEvent } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS, z, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { resolveWindowId } from './helpers';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';
import { setFindBarActive } from '../shortcuts';
import { createPopupWindow, clampToDisplay } from './popupUtils';

const findStartSchema = z.object({
  text: z.string(),
  matchCase: z.boolean().optional(),
  windowId: z.number().optional(),
});

const findWindowIdSchema = z.object({ windowId: z.number().optional() }).optional();

interface WindowFindState {
  text: string;
  matchCase: boolean;
  listener: (event: Electron.Event, result: Electron.FoundInPageResult) => void;
  wcId: number;
}

const findStates = new Map<number, WindowFindState>();
const findBarPopups = new Map<number, BrowserWindow>();

export function setFindBarPopup(windowId: number, popup: BrowserWindow | null): void {
  if (popup === null) {
    findBarPopups.delete(windowId);
  } else {
    findBarPopups.set(windowId, popup);
  }
}

function pushResult(windowId: number, current: number, total: number): void {
  const popup = findBarPopups.get(windowId);
  if (popup && !popup.isDestroyed()) {
    popup.webContents.send(IPC_EVENTS.FIND_RESULT, { current, total, windowId });
  }
}

function clearWindowFind(windowId: number): void {
  const state = findStates.get(windowId);
  if (!state) return;
  const wc = electronWebContents.fromId(state.wcId);
  if (wc && !wc.isDestroyed()) {
    wc.removeListener('found-in-page', state.listener);
    wc.stopFindInPage('clearSelection');
  }
  findStates.delete(windowId);
}

function resolveTargetWindowId(event: IpcMainInvokeEvent, payload: unknown): number | null {
  const parsed = findWindowIdSchema.safeParse(payload);
  if (parsed.success && parsed.data?.windowId !== undefined) {
    return parsed.data.windowId;
  }
  return resolveWindowId(event);
}

export function registerFindHandlers(ctx: IpcContext): void {
  // ── find-bar:open ──────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.FIND_BAR_OPEN,
    async (event, rawPayload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.FIND_BAR_OPEN);
        const parsed = z.object({ windowId: z.number() }).safeParse(rawPayload);
        if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };

        const { windowId } = parsed.data;
        const parentWin = BrowserWindow.fromId(windowId);
        if (!parentWin || parentWin.isDestroyed()) return { ok: true, data: undefined };

        const existing = findBarPopups.get(windowId);
        if (existing && !existing.isDestroyed()) {
          existing.focus();
          return { ok: true, data: undefined };
        }

        const layout = ctx.tabManager.getWindowLayout(windowId);
        const contentBounds = parentWin.getContentBounds();
        const addressBarHeight = layout?.addressBarHeight ?? 32;

        const FIND_BAR_WIDTH = 400;
        const FIND_BAR_HEIGHT = 44;
        const MARGIN = 12;

        const rawX = contentBounds.x + contentBounds.width - FIND_BAR_WIDTH - MARGIN;
        const rawY = contentBounds.y + addressBarHeight + MARGIN;
        const { x, y } = clampToDisplay(rawX, rawY, FIND_BAR_WIDTH, FIND_BAR_HEIGHT);

        const popup = createPopupWindow({
          width: FIND_BAR_WIDTH,
          height: FIND_BAR_HEIGHT,
          x,
          y,
          roundedCorners: true,
          focusable: true,
          transparent: false,
          parent: parentWin,
          backgroundColor: '#1e2229',
        });

        const profileId = ctx.profileWindowManager.getProfileForWindow(windowId);
        if (profileId) {
          ctx.profileWindowManager.registerAuxiliaryWindow(popup.id, profileId);
        }

        findBarPopups.set(windowId, popup);
        setFindBarActive(windowId, true);

        popup.on('closed', () => {
          if (profileId) ctx.profileWindowManager.unregisterAuxiliaryWindow(popup.id);
          if (findBarPopups.get(windowId) === popup) findBarPopups.delete(windowId);
          clearWindowFind(windowId);
          setFindBarActive(windowId, false);
          if (!parentWin.isDestroyed()) {
            parentWin.webContents.send(IPC_EVENTS.FIND_BAR_CLOSED, { windowId });
          }
        });

        const pageUrl = new URL('vela://find-bar');
        pageUrl.searchParams.set('windowId', String(windowId));
        await popup.loadURL(pageUrl.toString());
        popup.show();

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FIND_BAR_OPEN);
      }
    },
  );

  // ── find-bar:close ─────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.FIND_BAR_CLOSE,
    async (event, rawPayload): Promise<IpcResponse<void>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.FIND_BAR_CLOSE);
        const parsed = z.object({ windowId: z.number() }).safeParse(rawPayload);
        if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };

        const { windowId } = parsed.data;
        const popup = findBarPopups.get(windowId);
        if (popup && !popup.isDestroyed()) {
          popup.close();
        } else {
          clearWindowFind(windowId);
          setFindBarActive(windowId, false);
        }

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FIND_BAR_CLOSE);
      }
    },
  );

  // ── find:start ─────────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.FIND_START,
    (event, rawPayload): IpcResponse<void> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.FIND_START);
        const parsed = findStartSchema.safeParse(rawPayload);
        if (!parsed.success) return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };

        const windowId = parsed.data.windowId ?? resolveWindowId(event);
        if (windowId === null) return { ok: false, error: 'NO_WINDOW' };

        const wc = ctx.tabManager.getActiveTabWebContents(windowId);
        if (!wc || wc.isDestroyed()) return { ok: false, error: 'NO_ACTIVE_TAB' };

        clearWindowFind(windowId);

        const { text, matchCase = false } = parsed.data;

        if (!text) {
          pushResult(windowId, 0, 0);
          return { ok: true, data: undefined };
        }

        const listener = (_evt: Electron.Event, result: Electron.FoundInPageResult): void => {
          pushResult(windowId, result.activeMatchOrdinal, result.matches);
        };

        wc.on('found-in-page', listener);
        findStates.set(windowId, { text, matchCase, listener, wcId: wc.id });
        wc.findInPage(text, { matchCase, forward: true });

        // When called from popup (has explicit windowId), sync query back to shell
        if (parsed.data.windowId !== undefined) {
          const parentWin = BrowserWindow.fromId(parsed.data.windowId);
          if (parentWin && !parentWin.isDestroyed()) {
            parentWin.webContents.send(IPC_EVENTS.FIND_BAR_QUERY_SYNC, {
              text,
              matchCase,
              windowId: parsed.data.windowId,
            });
          }
        }

        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FIND_START);
      }
    },
  );

  // ── find:next ──────────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.FIND_NEXT,
    (event, rawPayload): IpcResponse<void> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.FIND_NEXT);
        const windowId = resolveTargetWindowId(event, rawPayload);
        if (windowId === null) return { ok: true, data: undefined };

        const state = findStates.get(windowId);
        if (!state) return { ok: true, data: undefined };

        const wc = ctx.tabManager.getActiveTabWebContents(windowId);
        if (!wc || wc.isDestroyed()) return { ok: false, error: 'NO_ACTIVE_TAB' };

        wc.findInPage(state.text, { matchCase: state.matchCase, forward: true, findNext: true });
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FIND_NEXT);
      }
    },
  );

  // ── find:prev ──────────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.FIND_PREV,
    (event, rawPayload): IpcResponse<void> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.FIND_PREV);
        const windowId = resolveTargetWindowId(event, rawPayload);
        if (windowId === null) return { ok: true, data: undefined };

        const state = findStates.get(windowId);
        if (!state) return { ok: true, data: undefined };

        const wc = ctx.tabManager.getActiveTabWebContents(windowId);
        if (!wc || wc.isDestroyed()) return { ok: false, error: 'NO_ACTIVE_TAB' };

        wc.findInPage(state.text, { matchCase: state.matchCase, forward: false, findNext: true });
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FIND_PREV);
      }
    },
  );

  // ── find:stop ──────────────────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.FIND_STOP,
    (event, rawPayload): IpcResponse<void> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.FIND_STOP);
        const windowId = resolveTargetWindowId(event, rawPayload);
        if (windowId === null) return { ok: true, data: undefined };

        clearWindowFind(windowId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.FIND_STOP);
      }
    },
  );
}

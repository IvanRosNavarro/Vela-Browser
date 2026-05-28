import { ipcMain, type IpcMainEvent, BrowserWindow } from 'electron';
import type { IpcContext } from '../ipc/context';
import type { CommandRegistry } from '../commands/registry';
import type { CommandContext } from '@vela/shared';

type Direction = 'left' | 'right' | 'up' | 'down';

interface GestureSegment {
  direction: Direction;
  distance: number;
}

interface GestureSettings {
  minSegmentPx: number;
  bindings: Array<{ pattern: string[]; commandId: string }>;
  profileId: string;
}

interface GestureState {
  active: boolean;
  segments: GestureSegment[];
  currentDirection: Direction | null;
  currentDist: number;
  segStartX: number;
  segStartY: number;
  dirRefX: number;
  dirRefY: number;
  settings: GestureSettings | null;
}

const DIRECTION_THRESHOLD = 30;

const DEFAULT_BINDINGS: Array<{ pattern: string[]; commandId: string }> = [
  { pattern: ['left'],         commandId: 'nav.back' },
  { pattern: ['right'],        commandId: 'nav.forward' },
  { pattern: ['up'],           commandId: 'internal.openNewTab' },
  { pattern: ['down'],         commandId: 'tab.closeActive' },
  { pattern: ['up', 'right'],  commandId: 'tab.reopenClosed' },
  { pattern: ['down', 'left'], commandId: 'tabSwitcher.open' },
];

function getDirection(dx: number, dy: number): Direction | null {
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx < DIRECTION_THRESHOLD && absDy < DIRECTION_THRESHOLD) return null;
  if (absDx > absDy) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

function matchPattern(
  pattern: string[],
  bindings: Array<{ pattern: string[]; commandId: string }>,
): string | null {
  const hit = bindings.find(
    b => b.pattern.length === pattern.length && b.pattern.every((s, i) => s === pattern[i]),
  );
  return hit?.commandId ?? null;
}

function freshState(): GestureState {
  return {
    active: false,
    segments: [],
    currentDirection: null,
    currentDist: 0,
    segStartX: 0,
    segStartY: 0,
    dirRefX: 0,
    dirRefY: 0,
    settings: null,
  };
}

export class GestureRecognizer {
  private readonly states = new Map<number, GestureState>();
  private commandRegistry: CommandRegistry | null = null;

  constructor(private readonly ctx: IpcContext) {
    this.registerIpcHandlers();
  }

  setCommandRegistry(cr: CommandRegistry): void {
    this.commandRegistry = cr;
  }

  private getWindowId(event: IpcMainEvent): number | null {
    const win =
      BrowserWindow.fromWebContents(event.sender) ??
      (event.sender as typeof event.sender & {
        getOwnerBrowserWindow?(): BrowserWindow | null;
      }).getOwnerBrowserWindow?.() ??
      null;
    if (!win) return null;
    return (win.getParentWindow() ?? win).id;
  }

  private readSettings(windowId: number): GestureSettings | null {
    const profileId = this.ctx.profileWindowManager.getProfileForWindow(windowId);
    if (!profileId) return null;
    try {
      const repos = this.ctx.profileManager.getRepositories(profileId);
      const enabledRaw = repos.settings.get('gestures:enabled');
      const enabled = enabledRaw !== null ? (JSON.parse(enabledRaw) as boolean) : true;
      if (!enabled) return null;

      const minSegRaw = repos.settings.get('gestures:min-segment-px');
      const minSegmentPx = minSegRaw !== null ? (JSON.parse(minSegRaw) as number) : 60;

      const bindingsRaw = repos.settings.get('gestures:bindings');
      const bindings = bindingsRaw !== null
        ? (JSON.parse(bindingsRaw) as Array<{ pattern: string[]; commandId: string }>)
        : DEFAULT_BINDINGS;

      return { minSegmentPx, bindings, profileId };
    } catch {
      return null;
    }
  }

  private registerIpcHandlers(): void {
    // ── gesture:wcv-start ─────────────────────────────────────────────────────
    ipcMain.on('gesture:wcv-start', (event: IpcMainEvent, payload: unknown) => {
      const windowId = this.getWindowId(event);
      if (!windowId) return;

      const settings = this.readSettings(windowId);
      if (!settings) return;

      const p = payload as { x: number; y: number };
      const state = freshState();
      state.active = true;
      state.segStartX = p.x;
      state.segStartY = p.y;
      state.dirRefX = p.x;
      state.dirRefY = p.y;
      state.settings = settings;
      this.states.set(windowId, state);
    });

    // ── gesture:wcv-move ──────────────────────────────────────────────────────
    ipcMain.on('gesture:wcv-move', (event: IpcMainEvent, payload: unknown) => {
      const windowId = this.getWindowId(event);
      if (!windowId) return;
      const state = this.states.get(windowId);
      if (!state?.active) return;

      const p = payload as { x: number; y: number };

      const windowDx = p.x - state.dirRefX;
      const windowDy = p.y - state.dirRefY;
      const windowDist = Math.sqrt(windowDx * windowDx + windowDy * windowDy);
      if (windowDist < DIRECTION_THRESHOLD) return;

      const dir = getDirection(windowDx, windowDy);
      if (dir === null) return;

      const minSeg = state.settings?.minSegmentPx ?? 60;
      const prevDir = state.currentDirection;
      const distFromSeg = Math.sqrt(
        (p.x - state.segStartX) * (p.x - state.segStartX) +
        (p.y - state.segStartY) * (p.y - state.segStartY),
      );

      if (prevDir !== dir) {
        if (prevDir !== null) {
          if (distFromSeg >= minSeg) {
            state.segments.push({ direction: prevDir, distance: distFromSeg });
          }
          state.segStartX = p.x;
          state.segStartY = p.y;
          state.currentDist = 0;
        } else {
          state.currentDist = distFromSeg;
        }
        state.currentDirection = dir;
      } else {
        state.currentDist = distFromSeg;
      }

      state.dirRefX = p.x;
      state.dirRefY = p.y;
    });

    // ── gesture:wcv-end ───────────────────────────────────────────────────────
    ipcMain.on('gesture:wcv-end', (event: IpcMainEvent, payload: unknown) => {
      const windowId = this.getWindowId(event);
      if (!windowId) return;
      const state = this.states.get(windowId);
      if (!state?.active) return;
      state.active = false;

      const settings = state.settings;
      const fin = payload as { x: number; y: number } | null;

      if (settings && state.currentDirection !== null) {
        let finalDist = state.currentDist;
        if (fin) {
          finalDist = Math.sqrt(
            (fin.x - state.segStartX) * (fin.x - state.segStartX) +
            (fin.y - state.segStartY) * (fin.y - state.segStartY),
          );
        }
        if (finalDist >= settings.minSegmentPx) {
          state.segments.push({ direction: state.currentDirection, distance: finalDist });
        }
      }

      // Fallback: no pointermove events arrived — compute from gesture start to end.
      if (state.segments.length === 0 && settings && fin) {
        const dx = fin.x - state.segStartX;
        const dy = fin.y - state.segStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dir = getDirection(dx, dy);
        if (dir !== null && dist >= settings.minSegmentPx) {
          state.segments.push({ direction: dir, distance: dist });
        }
      }

      if (settings && state.segments.length > 0 && this.commandRegistry) {
        const pattern = state.segments.map(s => s.direction);
        const commandId = matchPattern(pattern, settings.bindings);
        if (commandId) {
          const ctx: CommandContext = {
            windowId,
            activeProfileId: settings.profileId,
            activeTabId: this.ctx.tabManager.getActiveTabId(windowId),
            activeWorkspaceId: this.ctx.tabManager.getWorkspaceForWindow(windowId),
          };
          void this.commandRegistry.execute(commandId, ctx).catch(() => {});
        }
      }
    });

    // ── gesture:wcv-cancel ────────────────────────────────────────────────────
    ipcMain.on('gesture:wcv-cancel', (event: IpcMainEvent) => {
      const windowId = this.getWindowId(event);
      if (!windowId) return;
      const state = this.states.get(windowId);
      if (state) state.active = false;
    });
  }
}

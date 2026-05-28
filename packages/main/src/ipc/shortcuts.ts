import fs from 'node:fs';
import { ipcMain, dialog, BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import {
  IPC_CHANNELS,
  shortcutsSetInputSchema,
  shortcutsImportSchema,
  shortcutsResetOneInputSchema,
  type IpcResponse,
  type ShortcutCommandInfo,
} from '@vela/shared';
import type { CommandRegistry } from '../commands/registry';
import { normalizeShortcutString, RESERVED_COMBOS, getSystemCombos } from '../shortcuts';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';

const SHORTCUTS_CUSTOM_KEY = 'shortcuts:custom';

/** Comandos que requieren argumentos no derivables del contexto activo. */
const PARAMETRIC_COMMANDS = new Set([
  'workspace.switchToIndex',
  'workspace.switchTo',
  'tab.activate',
  'tab.close',
  'tab.cycleMru',
  'folder.toggleCollapse',
  'profile.openInNewWindow',
]);

function readCustom(ctx: IpcContext): Record<string, string | null> {
  const raw = ctx.repositories.appMetadata.get(SHORTCUTS_CUSTOM_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string | null>;
  } catch {
    return {};
  }
}

function writeCustom(ctx: IpcContext, data: Record<string, string | null>): void {
  ctx.repositories.appMetadata.set(SHORTCUTS_CUSTOM_KEY, JSON.stringify(data));
}

/**
 * Devuelve los atajos activos de todos los comandos configurables, incluyendo
 * si son default o custom, para que el renderer los muestre correctamente.
 */
function buildShortcutInfoList(
  registry: CommandRegistry,
  ctx: IpcContext,
): ShortcutCommandInfo[] {
  const custom = readCustom(ctx);
  return registry
    .list()
    .filter((cmd) => !PARAMETRIC_COMMANDS.has(cmd.id))
    .map((cmd) => ({
      id: cmd.id,
      title: cmd.title,
      category: cmd.category,
      defaultShortcut: cmd.defaultShortcut,
      customShortcut: cmd.id in custom ? custom[cmd.id] : undefined,
    }));
}

/**
 * Detecta conflictos internos en un mapa de atajos: dos comandos asignados
 * al mismo combo. Devuelve la lista de IDs de comandos en conflicto.
 */
function detectInternalConflicts(
  data: Record<string, string | null>,
): string[] {
  const seen = new Map<string, string>();
  const conflicts: string[] = [];
  for (const [cmdId, shortcut] of Object.entries(data)) {
    if (!shortcut) continue;
    let normalized: string;
    try {
      normalized = normalizeShortcutString(shortcut);
    } catch {
      continue;
    }
    const existing = seen.get(normalized);
    if (existing) {
      conflicts.push(cmdId);
    } else {
      seen.set(normalized, cmdId);
    }
  }
  return conflicts;
}

export function registerShortcutsHandlers(
  ctx: IpcContext,
  registry: CommandRegistry,
  refreshShortcuts: () => void,
  getActiveSystemCombos: () => ReadonlySet<string> = getSystemCombos,
): void {
  // shortcuts:get-all → lista completa con estado custom/default
  ipcMain.handle(
    IPC_CHANNELS.SHORTCUTS_GET_ALL,
    async (): Promise<IpcResponse<ShortcutCommandInfo[]>> => {
      try {
        return { ok: true, data: buildShortcutInfoList(registry, ctx) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SHORTCUTS_GET_ALL);
      }
    },
  );

  // shortcuts:set → guarda un atajo custom (o null para eliminarlo)
  ipcMain.handle(
    IPC_CHANNELS.SHORTCUTS_SET,
    async (event: IpcMainInvokeEvent, payload: unknown): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.SHORTCUTS_SET);
      const parsed = shortcutsSetInputSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      const { commandId, shortcut } = parsed.data;

      // Validaciones servidor-side básicas
      if (shortcut !== null) {
        let normalizedNew: string;
        try {
          normalizedNew = normalizeShortcutString(shortcut);
        } catch {
          return { ok: false, error: 'INVALID_SHORTCUT', details: `Combinación inválida: ${shortcut}` };
        }
        if (RESERVED_COMBOS.has(normalizedNew) || getActiveSystemCombos().has(normalizedNew)) {
          return {
            ok: false,
            error: 'RESERVED_SHORTCUT',
            details: `La combinación "${shortcut}" está reservada por el sistema.`,
          };
        }
      }

      try {
        const custom = readCustom(ctx);
        if (shortcut === null) {
          custom[commandId] = null;
        } else {
          custom[commandId] = shortcut;
        }
        writeCustom(ctx, custom);
        refreshShortcuts();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SHORTCUTS_SET);
      }
    },
  );

  // shortcuts:reset-all → elimina todos los overrides
  ipcMain.handle(
    IPC_CHANNELS.SHORTCUTS_RESET_ALL,
    async (): Promise<IpcResponse<void>> => {
      try {
        ctx.repositories.appMetadata.delete(SHORTCUTS_CUSTOM_KEY);
        refreshShortcuts();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SHORTCUTS_RESET_ALL);
      }
    },
  );

  // shortcuts:reset-one → elimina el override de un comando (vuelve al defaultShortcut)
  ipcMain.handle(
    IPC_CHANNELS.SHORTCUTS_RESET_ONE,
    async (event: IpcMainInvokeEvent, payload: unknown): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.SHORTCUTS_RESET_ONE);
      const parsed = shortcutsResetOneInputSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const custom = readCustom(ctx);
        delete custom[parsed.data.commandId];
        writeCustom(ctx, custom);
        refreshShortcuts();
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SHORTCUTS_RESET_ONE);
      }
    },
  );

  // shortcuts:export → abre save dialog y escribe JSON
  ipcMain.handle(
    IPC_CHANNELS.SHORTCUTS_EXPORT,
    async (event: IpcMainInvokeEvent): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.SHORTCUTS_EXPORT);
      try {
        const win = BrowserWindow.getFocusedWindow();
        const result = await dialog.showSaveDialog(win ?? undefined!, {
          defaultPath: 'vela-shortcuts.json',
          filters: [{ name: 'Vela Shortcuts', extensions: ['json'] }],
        });
        if (result.canceled || !result.filePath) {
          return { ok: true, data: undefined };
        }
        const custom = readCustom(ctx);
        fs.writeFileSync(result.filePath, JSON.stringify(custom, null, 2), 'utf8');
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SHORTCUTS_EXPORT);
      }
    },
  );

  // shortcuts:import → abre open dialog, valida JSON, aplica y devuelve resumen
  ipcMain.handle(
    IPC_CHANNELS.SHORTCUTS_IMPORT,
    async (event: IpcMainInvokeEvent): Promise<IpcResponse<{ imported: number; conflicts: string[] }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.SHORTCUTS_IMPORT);
      try {
        const win = BrowserWindow.getFocusedWindow();
        const result = await dialog.showOpenDialog(win ?? undefined!, {
          filters: [{ name: 'Vela Shortcuts', extensions: ['json'] }],
          properties: ['openFile'],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { ok: true, data: { imported: 0, conflicts: [] } };
        }
        const raw = fs.readFileSync(result.filePaths[0]!, 'utf8');
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return { ok: false, error: 'INVALID_JSON', details: 'El archivo no contiene JSON válido.' };
        }
        const validated = shortcutsImportSchema.safeParse(parsed);
        if (!validated.success) {
          return { ok: false, error: 'INVALID_FORMAT', details: validated.error.flatten() };
        }

        const incoming = validated.data;
        const conflicts = detectInternalConflicts(incoming);

        // Aplicar (sobreescribe custom existentes; en conflictos internos
        // prevalece la primera ocurrencia — el detectInternalConflicts ya identifica
        // los segundos para reportarlos al renderer).
        const existing = readCustom(ctx);
        for (const [cmdId, shortcut] of Object.entries(incoming)) {
          if (!conflicts.includes(cmdId)) {
            existing[cmdId] = shortcut;
          }
        }
        writeCustom(ctx, existing);
        refreshShortcuts();

        const imported = Object.keys(incoming).length - conflicts.length;
        return { ok: true, data: { imported, conflicts } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SHORTCUTS_IMPORT);
      }
    },
  );
}

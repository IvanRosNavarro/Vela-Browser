import {
  BrowserWindow,
  type Input,
  type WebContents,
} from 'electron';
import { IPC_EVENTS } from '@vela/shared';
import { logger } from '../logger';
import type { CommandRegistry } from '../commands/registry';
import { buildContext } from '../commands/context';
import type { IpcContext } from '../ipc';

// Ctrl+Shift+P estaba reservado para el command palette de Fase 4.5.
// Ya está implementado (commandPalette.open); el conjunto queda vacío.
export const RESERVED_COMBOS: ReadonlySet<string> = new Set();

/**
 * Devuelve el conjunto de combos reservados por el sistema según el modificador
 * configurado para cambio de workspace y la plataforma.
 * - modifier='ctrl' + darwin  → Meta+Digit1..9 (Cmd)
 * - modifier='ctrl' + otros   → Ctrl+Digit1..9
 * - modifier='alt'            → Alt+Digit1..9 (todas las plataformas)
 * Ctrl+Tab y Ctrl+Shift+Tab son siempre del sistema.
 */
export function getSystemCombos(
  modifier: 'ctrl' | 'alt' = 'alt',
  platform: string = process.platform,
): ReadonlySet<string> {
  const wsMod = modifier === 'alt' ? 'Alt' : (platform === 'darwin' ? 'Meta' : 'Ctrl');
  return new Set([
    `${wsMod}+Digit1`, `${wsMod}+Digit2`, `${wsMod}+Digit3`,
    `${wsMod}+Digit4`, `${wsMod}+Digit5`, `${wsMod}+Digit6`,
    `${wsMod}+Digit7`, `${wsMod}+Digit8`, `${wsMod}+Digit9`,
    'Ctrl+Tab',
    'Ctrl+Shift+Tab',
  ]);
}

// Combos fijos registrados por el sistema que el usuario no puede reasignar
// vía el panel de settings. Se exporta como valor por defecto (modifier=ctrl)
// para compatibilidad; el handler IPC usa getSystemCombos() con el modifier actual.
export const SYSTEM_COMBOS: ReadonlySet<string> = getSystemCombos();

export interface NormalizedCombo {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  code: string;
}

interface ShortcutBinding {
  combo: NormalizedCombo;
  source: string;
  invoke: (windowId: number) => Promise<void> | void;
}

function comboKey(c: NormalizedCombo): string {
  const mods: string[] = [];
  if (c.ctrl) mods.push('Ctrl');
  if (c.shift) mods.push('Shift');
  if (c.alt) mods.push('Alt');
  if (c.meta) mods.push('Meta');
  mods.push(c.code);
  return mods.join('+');
}

function parseKey(raw: string): string {
  const k = raw.trim();
  if (/^[0-9]$/.test(k)) return `Digit${k}`;
  if (/^[a-zA-Z]$/.test(k)) return `Key${k.toUpperCase()}`;
  if (/^F([1-9]|1[0-9]|2[0-4])$/i.test(k)) return k.toUpperCase();
  switch (k) {
    case 'Tab':
      return 'Tab';
    case 'Enter':
    case 'Return':
      return 'Enter';
    case 'Escape':
    case 'Esc':
      return 'Escape';
    case 'Space':
      return 'Space';
    case 'Backspace':
      return 'Backspace';
    case 'Delete':
    case 'Del':
      return 'Delete';
    case 'Left':
      return 'ArrowLeft';
    case 'Right':
      return 'ArrowRight';
    case 'Up':
      return 'ArrowUp';
    case 'Down':
      return 'ArrowDown';
    case '[':
      return 'BracketLeft';
    case ']':
      return 'BracketRight';
    case ',':
      return 'Comma';
    case '.':
      return 'Period';
    case '/':
      return 'Slash';
    case ';':
      return 'Semicolon';
    case "'":
      return 'Quote';
    case '`':
      return 'Backquote';
    case '\\':
      return 'Backslash';
    case '-':
      return 'Minus';
    case '=':
      return 'Equal';
    default:
      throw new Error(`Atajo: tecla desconocida "${raw}"`);
  }
}

export function parseShortcut(combo: string): NormalizedCombo {
  const parts = combo.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`Atajo vacío: "${combo}"`);
  }
  const result: NormalizedCombo = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
    code: '',
  };
  for (let i = 0; i < parts.length - 1; i++) {
    const p = (parts[i] ?? '').toLowerCase();
    if (p === 'ctrl' || p === 'control') result.ctrl = true;
    else if (p === 'shift') result.shift = true;
    else if (p === 'alt' || p === 'option') result.alt = true;
    else if (p === 'meta' || p === 'cmd' || p === 'super' || p === 'command')
      result.meta = true;
    else throw new Error(`Atajo: modificador desconocido "${parts[i]}"`);
  }
  const last = parts[parts.length - 1];
  if (!last) throw new Error(`Atajo sin tecla base: "${combo}"`);
  result.code = parseKey(last);
  return result;
}

/** Devuelve la forma canónica de una combinación para comparación y storage. */
export function normalizeShortcutString(combo: string): string {
  return comboKey(parseShortcut(combo));
}

function matchesInput(combo: NormalizedCombo, input: Input): boolean {
  return (
    combo.ctrl === input.control &&
    combo.shift === input.shift &&
    combo.alt === input.alt &&
    combo.meta === input.meta &&
    combo.code === input.code
  );
}

function isControlKey(code: string): boolean {
  return code === 'ControlLeft' || code === 'ControlRight';
}

export class ShortcutTable {
  private readonly bindings: ShortcutBinding[] = [];
  private readonly seen = new Map<string, string>();

  register(
    combo: string,
    source: string,
    invoke: (windowId: number) => Promise<void> | void,
  ): void {
    const normalized = parseShortcut(combo);
    const key = comboKey(normalized);
    if (RESERVED_COMBOS.has(key)) {
      throw new Error(
        `Atajo reservado: ${combo} no puede asignarse.`,
      );
    }
    const existing = this.seen.get(key);
    if (existing !== undefined) {
      throw new Error(
        `Atajo duplicado: ${combo} ya estaba registrado por "${existing}", ahora intenta "${source}".`,
      );
    }
    this.seen.set(key, source);
    this.bindings.push({ combo: normalized, source, invoke });
  }

  /** Intenta registrar el atajo; si hay colisión lo ignora silenciosamente. */
  tryRegister(
    combo: string,
    source: string,
    invoke: (windowId: number) => Promise<void> | void,
  ): boolean {
    try {
      this.register(combo, source, invoke);
      return true;
    } catch {
      return false;
    }
  }

  match(input: Input): ShortcutBinding | null {
    if (input.type !== 'keyDown') return null;
    for (const b of this.bindings) {
      if (matchesInput(b.combo, input)) return b;
    }
    return null;
  }

  /** Lista todas las combinaciones registradas (para debugging). */
  listBindings(): ReadonlyArray<{ combo: string; source: string }> {
    return this.bindings.map((b) => ({ combo: comboKey(b.combo), source: b.source }));
  }
}

export interface ShortcutHandle {
  attach(wc: WebContents, resolveWindowId: () => number | null): () => void;
  attachWindow(window: BrowserWindow): void;
  list(): ReadonlyArray<{ combo: string; source: string }>;
}

/**
 * Construye la tabla de atajos a partir del registry de comandos.
 *
 * Los atajos personalizados del usuario se pasan en `custom`:
 *   - clave ausente → usar defaultShortcut del comando
 *   - valor string → usar ese atajo en lugar del default
 *   - valor null → el usuario ha eliminado el atajo (ningún atajo para ese comando)
 *
 * Los bindings fijos del sistema (workspace digit, Ctrl+Tab, alias) se registran
 * PRIMERO. Si un atajo custom coincide con uno de ellos, se ignora con log.
 */
export function buildShortcutTable(
  registry: CommandRegistry,
  ipc: IpcContext,
  custom: Record<string, string | null> = {},
  workspaceSwitchModifier: 'ctrl' | 'alt' = 'alt',
): ShortcutTable {
  const table = new ShortcutTable();

  const wsMod = workspaceSwitchModifier === 'alt'
    ? 'Alt'
    : (process.platform === 'darwin' ? 'Meta' : 'Ctrl');

  // 1) Bindings fijos del sistema (no configurables por el usuario).
  for (let i = 1; i <= 9; i++) {
    table.register(`${wsMod}+${i}`, `workspace.switchToIndex#${i}`, async (windowId) => {
      await registry.execute(
        'workspace.switchToIndex',
        buildContext(ipc, windowId),
        { index: i },
      );
    });
  }

  table.register('Ctrl+Tab', 'tab.cycleMru#forward', async (windowId) => {
    await registry.execute('tab.cycleMru', buildContext(ipc, windowId), {
      direction: 'forward',
    });
  });
  table.register('Ctrl+Shift+Tab', 'tab.cycleMru#backward', async (windowId) => {
    await registry.execute('tab.cycleMru', buildContext(ipc, windowId), {
      direction: 'backward',
    });
  });

  // 2) Atajos configurables: defaultShortcut sobreescrito por custom si procede.
  for (const cmd of registry.list()) {
    const effectiveShortcut: string | null | undefined =
      cmd.id in custom ? custom[cmd.id] : cmd.defaultShortcut;

    if (!effectiveShortcut) continue; // null o undefined → sin atajo

    const ok = table.tryRegister(effectiveShortcut, cmd.id, async (windowId) => {
      await registry.execute(cmd.id, buildContext(ipc, windowId));
    });
    if (!ok) {
      logger.warn(
        `[shortcuts] atajo "${effectiveShortcut}" para "${cmd.id}" ignorado por conflicto`,
      );
    }
  }

  // 3) Alias clásicos: solo se registran si el combo no está ocupado.
  //    nav.reload  → Ctrl+R (alias de F5)
  const effectiveReload = 'nav.reload' in custom ? custom['nav.reload'] : 'F5';
  if (effectiveReload && effectiveReload !== 'Ctrl+R') {
    table.tryRegister('Ctrl+R', 'nav.reload#alias', async (windowId) => {
      await registry.execute('nav.reload', buildContext(ipc, windowId));
    });
  }

  //    nav.focusAddressBar → Ctrl+E (alias de Ctrl+L)
  const effectiveFocus =
    'nav.focusAddressBar' in custom ? custom['nav.focusAddressBar'] : 'Ctrl+L';
  if (effectiveFocus && effectiveFocus !== 'Ctrl+E') {
    table.tryRegister('Ctrl+E', 'nav.focusAddressBar#alias', async (windowId) => {
      await registry.execute('nav.focusAddressBar', buildContext(ipc, windowId));
    });
  }

  return table;
}

/**
 * Registra si la barra de direcciones de una ventana está en modo edición.
 * Cuando lo está, el shortcut de Escape (nav.stop) no se intercepta para
 * que el renderer pueda cancelar la edición.
 */
const addressBarEditingByWindow = new Map<number, boolean>();

export function setAddressBarEditing(windowId: number, editing: boolean): void {
  if (editing) {
    addressBarEditingByWindow.set(windowId, true);
  } else {
    addressBarEditingByWindow.delete(windowId);
  }
}

const findBarActiveByWindow = new Map<number, boolean>();

export function setFindBarActive(windowId: number, active: boolean): void {
  if (active) {
    findBarActiveByWindow.set(windowId, true);
  } else {
    findBarActiveByWindow.delete(windowId);
  }
}

/**
 * Engancha la tabla —obtenida del getter— a un WebContents.
 * El getter se evalúa en cada evento de teclado, lo que permite
 * sustituir la tabla en caliente sin volver a adjuntar listeners.
 */
export function attachShortcuts(
  getTable: () => ShortcutTable | null,
  ipc: IpcContext,
  wc: WebContents,
  resolveWindowId: () => number | null,
): () => void {
  const handler = (event: Electron.Event, input: Input): void => {
    if (input.type === 'keyUp') {
      if (!isControlKey(input.code)) return;
      const windowId = resolveWindowId();
      if (windowId === null) return;
      try {
        ipc.tabManager.mruCommit(windowId);
      } catch (err) {
        logger.warn('[shortcuts] mruCommit falló', err);
      }
      ipc.events.emit(IPC_EVENTS.COMMAND_RENDERER_ACTION, {
        windowId,
        action: 'commit-mru-modal',
      });
      return;
    }
    if (input.type !== 'keyDown') return;
    const table = getTable();
    if (!table) return;
    const binding = table.match(input);
    if (!binding) return;
    const windowId = resolveWindowId();
    if (windowId === null) return;
    // Cuando la barra de direcciones está en edición o el find bar está activo,
    // dejamos pasar Escape al renderer para que pueda cancelar la edición.
    if (
      input.code === 'Escape' &&
      (addressBarEditingByWindow.get(windowId) === true ||
        findBarActiveByWindow.get(windowId) === true)
    ) {
      return;
    }
    event.preventDefault();
    void Promise.resolve(binding.invoke(windowId)).catch((err: unknown) => {
      logger.warn(`[shortcuts] dispatch falló (${binding.source})`, err);
    });
  };
  wc.on('before-input-event', handler);
  return () => {
    wc.removeListener('before-input-event', handler);
    const windowId = resolveWindowId();
    if (windowId !== null) addressBarEditingByWindow.delete(windowId);
  };
}

/**
 * Atajo de conveniencia: engancha la tabla al renderer de la BrowserWindow.
 */
export function attachWindowShortcuts(
  getTable: () => ShortcutTable | null,
  ipc: IpcContext,
  window: BrowserWindow,
): void {
  attachShortcuts(getTable, ipc, window.webContents, () =>
    window.isDestroyed() ? null : window.id,
  );
}

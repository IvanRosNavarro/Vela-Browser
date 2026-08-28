import { BrowserWindow, type Session } from 'electron';
import type { ElectronChromeExtensions } from 'electron-chrome-extensions';
import { IPC_EVENTS } from '@vela/shared';
import { logger } from '../logger';
import type { ShortcutTable } from '../shortcuts';
import type { IpcContext } from '../ipc';
import { wakeExtensionServiceWorker } from './wakeServiceWorker';

/**
 * Atajos de teclado declarados por las extensiones (`commands` del manifest).
 *
 * electron-chrome-extensions expone `chrome.commands.getAll()` y el evento
 * `chrome.commands.onCommand`, pero no engancha ningún atajo: siempre devuelve
 * `shortcut: ""` y nunca emite el evento. Sin esto, `Ctrl+Shift+L` (autorrelleno
 * de Bitwarden) o `Ctrl+Shift+Y` (abrir su popup) no hacen nada en Vela.
 *
 * Los atajos de Vela tienen prioridad: la tabla se construye primero con los
 * comandos del registry central y los de las extensiones se añaden al final con
 * `tryRegister`, así que un combo ya ocupado deja la extensión sin atajo (es lo
 * mismo que hace Chrome ante un conflicto).
 */
export interface ExtensionCommand {
  extensionId: string;
  extensionName: string;
  /** Nombre del comando en el manifest. `_execute_action` abre el popup. */
  name: string;
  description: string;
  /** Combo en formato de Vela, o null si el manifest no sugiere ninguno. */
  combo: string | null;
  session: Session;
}

interface EceRouter {
  sendEvent(targetExtensionId: string | undefined, eventName: string, ...args: unknown[]): void;
}

function getRouter(ext: ElectronChromeExtensions | undefined): EceRouter | null {
  return (
    (ext as unknown as { ctx?: { router?: EceRouter } } | undefined)?.ctx?.router ?? null
  );
}

/**
 * Traduce el `suggested_key` de un manifest de Chrome al formato que entiende
 * `parseShortcut`. Chrome usa `Command` para la tecla ⌘ y `MacCtrl` para el
 * Control físico de macOS.
 */
function toVelaCombo(suggested: unknown): string | null {
  const keys = suggested as
    | { default?: string; windows?: string; mac?: string; linux?: string }
    | undefined;
  if (!keys) return null;
  const raw =
    (process.platform === 'win32' ? keys.windows : undefined) ??
    (process.platform === 'darwin' ? keys.mac : undefined) ??
    (process.platform === 'linux' ? keys.linux : undefined) ??
    keys.default;
  if (!raw) return null;
  return raw
    .split('+')
    .map((p) => p.trim())
    .map((p) => (p === 'MacCtrl' ? 'Ctrl' : p === 'Command' ? 'Meta' : p))
    .join('+');
}

/** Comandos de todas las extensiones cargadas en una sesión. */
export function collectExtensionCommands(session: Session): ExtensionCommand[] {
  const out: ExtensionCommand[] = [];
  for (const ext of session.extensions.getAllExtensions()) {
    const manifest = ext.manifest as {
      commands?: Record<string, { description?: string; suggested_key?: unknown }>;
    };
    if (!manifest.commands) continue;
    for (const [name, details] of Object.entries(manifest.commands)) {
      out.push({
        extensionId: ext.id,
        extensionName: ext.name,
        name,
        description: details.description ?? name,
        combo: toVelaCombo(details.suggested_key),
        session,
      });
    }
  }
  return out;
}

/**
 * Añade a la tabla los atajos de las extensiones de todas las sesiones activas.
 * Debe llamarse DESPUÉS de registrar los comandos de Vela.
 *
 * Los comandos se agrupan por combinación de teclas porque la misma extensión
 * puede estar cargada en varios perfiles a la vez, cada uno con su sesión: un
 * combo se registra UNA vez y al pulsarlo se resuelve qué copia dispararlo
 * según el perfil de la ventana activa. Registrar un binding por sesión haría
 * que el segundo colisionara con el primero y el atajo solo funcionase en un
 * perfil.
 */
export function registerExtensionShortcuts(
  table: ShortcutTable,
  sessions: Iterable<Session>,
  extensionsFor: (session: Session) => ElectronChromeExtensions | undefined,
  ctx: IpcContext,
): void {
  const porCombo = new Map<string, ExtensionCommand[]>();
  for (const session of sessions) {
    for (const cmd of collectExtensionCommands(session)) {
      if (!cmd.combo) continue;
      const grupo = porCombo.get(cmd.combo);
      if (grupo) grupo.push(cmd);
      else porCombo.set(cmd.combo, [cmd]);
    }
  }

  const registrados: string[] = [];
  const descartados: string[] = [];

  for (const [combo, grupo] of porCombo) {
    const primero = grupo[0]!;
    const source = `extension:${primero.extensionId}:${primero.name}`;
    const ok = table.tryRegister(combo, source, async (windowId) => {
      const win = BrowserWindow.fromId(windowId);
      if (!win || win.isDestroyed()) return;

      // Resolver qué copia de la extensión corresponde a esta ventana: cada
      // perfil tiene su propia sesión y su propia instancia cargada.
      const wcSession = ctx.tabManager.getActiveTabWebContents(windowId)?.session;
      const cmd = grupo.find((c) => c.session === wcSession) ?? grupo[0]!;

      if (cmd.name === '_execute_action') {
        // Abrir el popup necesita las coordenadas del icono en la barra, que
        // solo conoce el renderer: le pedimos que lo abra como si se hubiera
        // pulsado el botón.
        win.webContents.send(IPC_EVENTS.EXTENSION_POPUP_TRIGGER, {
          extensionId: cmd.extensionId,
        });
        return;
      }

      const router = getRouter(extensionsFor(cmd.session));
      if (!router) {
        logger.warn(`[ext-commands] sin router para ${cmd.extensionId}`);
        return;
      }
      // Un worker dormido no tiene listeners registrados: el evento se
      // perdería sin llegar a la extensión.
      await wakeExtensionServiceWorker(cmd.session, cmd.extensionId);
      router.sendEvent(cmd.extensionId, 'commands.onCommand', cmd.name);
    });

    if (ok) registrados.push(`${combo}→${primero.extensionName}:${primero.name}`);
    else descartados.push(`${combo}(${primero.extensionName}:${primero.name})`);
  }

  if (registrados.length || descartados.length) {
    logger.info(
      `[ext-commands] ${registrados.length} atajos de extensión: ${registrados.join(', ')}` +
        (descartados.length
          ? ` | ${descartados.length} descartados porque el combo ya lo usa Vela: ${descartados.join(', ')}`
          : ''),
    );
  }
}

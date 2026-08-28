import { app, BrowserWindow, type Session } from 'electron';
import { logger } from '../logger';

/**
 * Mantiene en marcha el service worker de las extensiones que dependen de sus
 * content scripts (Bitwarden, gestores de contraseñas, traductores…).
 *
 * Chromium duerme el service worker de una extensión MV3 tras ~30 s sin
 * actividad. En Chrome eso casi nunca ocurre en extensiones como Bitwarden:
 * cada content script abre un `chrome.runtime.connect` y un port abierto
 * prolonga la vida del worker. En Electron el port NO lo prolonga, así que el
 * worker muere, sus ports se desconectan y los content scripts que escuchaban
 * esa desconexión se desmontan solos. A partir de ahí la extensión sigue viva
 * en la barra pero sorda en la página: es lo que hacía que Bitwarden abriese su
 * popup, mostrase las sugerencias y al pulsar "Fill" respondiese "Unable to
 * autofill the selected item on this page".
 *
 * Volver a arrancarlo en cuanto se para deja la ventana de desconexión en unos
 * milisegundos. Solo se hace:
 *   - con extensiones que declaran `content_scripts` (las demás no pierden nada
 *     por dormirse), y
 *   - mientras Vela está en primer plano. Con el navegador de fondo dejamos que
 *     el worker duerma y lo reactivamos al recuperar el foco, para no gastar CPU
 *     mientras el usuario no lo está usando.
 */

/** Sesiones ya vigiladas. `session.fromPartition` devuelve siempre la misma
 *  instancia y un perfil puede reabrirse, así que sin esto acumularíamos
 *  listeners sobre la misma sesión. */
const vigiladas = new WeakSet<Session>();

/** Scopes cuyo worker se paró con Vela en segundo plano, a la espera de que
 *  vuelva el foco. Clave: scope; valor: la sesión donde vive. */
const pendientes = new Map<string, Session>();

/** Margen mínimo entre reactivaciones del mismo worker. Evita un bucle cerrado
 *  si no llegara a arrancar. */
const REARRANQUE_MIN_MS = 5_000;
const ultimoRearranque = new Map<string, number>();

let focoEnganchado = false;

interface WorkerInfo {
  scriptUrl: string;
  scope: string;
}

/** Cualquier ventana de Vela con el foco cuenta, incluidos los popups. */
function velaEnPrimerPlano(): boolean {
  return BrowserWindow.getFocusedWindow() !== null;
}

function arrancar(session: Session, scope: string): void {
  const ahora = Date.now();
  if (ahora - (ultimoRearranque.get(scope) ?? 0) < REARRANQUE_MIN_MS) return;
  ultimoRearranque.set(scope, ahora);
  session.serviceWorkers.startWorkerForScope(scope).catch((err: unknown) => {
    logger.warn(`[ext] no se pudo reactivar el service worker de ${scope}`, err);
  });
}

function engancharFoco(): void {
  if (focoEnganchado) return;
  focoEnganchado = true;
  app.on('browser-window-focus', () => {
    if (pendientes.size === 0) return;
    for (const [scope, session] of pendientes) arrancar(session, scope);
    pendientes.clear();
  });
}

export function attachServiceWorkerKeeper(session: Session): void {
  if (vigiladas.has(session)) return;
  vigiladas.add(session);
  engancharFoco();

  // `running-status-changed` solo trae `versionId`; el scope hay que resolverlo
  // mientras el worker sigue listado (deja de estarlo al pararse).
  const scopePorVersion = new Map<number, string>();

  const recordarScopes = (): void => {
    const running = session.serviceWorkers.getAllRunning() as unknown as Record<
      string,
      WorkerInfo
    >;
    for (const [versionId, info] of Object.entries(running)) {
      if (info?.scope) scopePorVersion.set(Number(versionId), info.scope);
    }
  };

  const dependeDeContentScripts = (scope: string): boolean => {
    const id = scope.replace('chrome-extension://', '').replace(/\/$/, '');
    const ext = session.extensions.getAllExtensions().find((e) => e.id === id);
    if (!ext) return false;
    const manifest = ext.manifest as {
      content_scripts?: unknown[];
      background?: { service_worker?: string };
    };
    return (
      Boolean(manifest.background?.service_worker) &&
      Array.isArray(manifest.content_scripts) &&
      manifest.content_scripts.length > 0
    );
  };

  session.serviceWorkers.on(
    'running-status-changed',
    (details: { versionId: number; runningStatus: string }) => {
      if (details.runningStatus !== 'stopped') {
        recordarScopes();
        return;
      }

      const scope = scopePorVersion.get(details.versionId);
      if (!scope || !dependeDeContentScripts(scope)) return;

      if (velaEnPrimerPlano()) {
        arrancar(session, scope);
      } else {
        pendientes.set(scope, session);
      }
    },
  );
}

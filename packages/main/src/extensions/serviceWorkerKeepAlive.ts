import type { Session } from 'electron';
import { logger } from '../logger';

/**
 * Mantiene vivo el service worker de las extensiones que dependen de sus
 * content scripts (Bitwarden y demás gestores de contraseñas, traductores…).
 *
 * Chromium duerme el service worker de una extensión MV3 tras ~30 s sin
 * actividad. En Chrome eso apenas afecta a Bitwarden: cada content script abre
 * un `chrome.runtime.connect` y **un port abierto prolonga la vida del
 * worker**. En Electron el port no lo prolonga, así que el worker muere, sus
 * ports se desconectan y los content scripts que escuchaban esa desconexión se
 * desmontan solos. La extensión sigue viva en la barra pero está sorda en la
 * página: es lo que hace que Bitwarden abra su popup con las sugerencias
 * correctas y al pulsar "Fill" responda "Unable to autofill the selected item
 * on this page".
 *
 * `ServiceWorkerMain.startTask()` es la pieza que faltaba: mantiene el worker
 * en marcha **sin reiniciarlo**, que es exactamente lo que consigue un port en
 * Chrome. La tarea no se cierra nunca mientras la extensión esté cargada.
 *
 * La diferencia con lo que se intentó en v0.1.21 es esencial: aquello
 * *reactivaba* el worker cada vez que se paraba, y como cada arranque destruye
 * el estado en memoria —donde Bitwarden guarda el vault descifrado—, su popup
 * acababa mostrando la lista vacía. Aquí el worker no llega a pararse, así que
 * ese estado se conserva.
 */

/** Sesiones ya vigiladas. `session.fromPartition` devuelve siempre la misma
 *  instancia y un perfil puede reabrirse, así que sin esto acumularíamos
 *  listeners sobre la misma sesión. */
const vigiladas = new WeakSet<Session>();

export function attachServiceWorkerKeepAlive(session: Session): void {
  if (vigiladas.has(session)) return;
  vigiladas.add(session);

  const tareas = new Map<number, { end: () => void }>();

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

  const retener = (versionId: number): void => {
    if (tareas.has(versionId)) return;
    const worker = session.serviceWorkers.getWorkerFromVersionID(versionId);
    if (!worker || !dependeDeContentScripts(worker.scope)) return;
    try {
      tareas.set(versionId, worker.startTask());
      logger.info(`[ext] service worker retenido: ${worker.scope}`);
    } catch (err) {
      logger.warn(`[ext] no se pudo retener el service worker de ${worker.scope}`, err);
    }
  };

  session.serviceWorkers.on(
    'running-status-changed',
    (details: { versionId: number; runningStatus: string }) => {
      if (details.runningStatus === 'running') {
        retener(details.versionId);
      } else if (details.runningStatus === 'stopped') {
        // Si aun así se paró, la tarea ya no sirve de nada; se volverá a
        // retener cuando el worker arranque de nuevo.
        tareas.delete(details.versionId);
      }
    },
  );

  // Workers que ya estuvieran en marcha al adjuntarnos a la sesión.
  for (const versionId of Object.keys(session.serviceWorkers.getAllRunning())) {
    retener(Number(versionId));
  }
}

import type { Session } from 'electron';
import { logger } from '../logger';

/**
 * Arranca el service worker de una extensión MV3 si Chromium lo había
 * suspendido, y espera a que la extensión tenga tiempo de reinicializarse.
 *
 * Por qué hace falta: Chromium duerme el service worker de una extensión tras
 * ~30 s sin actividad. En Chrome eso apenas se nota en extensiones como
 * Bitwarden porque cada content script abre un `chrome.runtime.connect` y un
 * port abierto prolonga la vida del worker; en Electron el port no lo
 * prolonga. Al morir el worker sus ports se desconectan y los content scripts
 * que escuchaban esa desconexión se desmontan solos: la extensión sigue viva
 * en la barra pero ya no puede leer la página. El síntoma en Bitwarden es
 * "Unable to autofill the selected item on this page" al pulsar "Fill".
 *
 * Al volver a arrancar, la extensión rehace su inicialización y reinyecta sus
 * content scripts, pero eso no es instantáneo: si el popup se abre en ese
 * instante, pregunta antes de que la página vuelva a responder. Por eso, y
 * solo cuando el worker estaba realmente parado, se le da un margen.
 *
 * No se llama en los caminos que nacen en la página: un
 * `chrome.runtime.sendMessage` desde un content script o desde el popup ya
 * despierta al worker, igual que los eventos de pestaña que emite
 * electron-chrome-extensions.
 */

/** Margen para que la extensión rehaga su inicialización tras un arranque en
 *  frío. Solo se paga cuando el worker estaba parado. */
const MARGEN_ARRANQUE_FRIO_MS = 1_200;

export interface WakeOptions {
  /** Esperar el margen de arranque en frío si el worker estaba parado. */
  esperarInicializacion?: boolean;
}

export async function wakeExtensionServiceWorker(
  session: Session,
  extensionId: string,
  options: WakeOptions = {},
): Promise<void> {
  const ext = session.extensions
    .getAllExtensions()
    .find((e) => e.id === extensionId);
  const manifest = ext?.manifest as
    | { background?: { service_worker?: string } }
    | undefined;
  // Las extensiones MV2 (background page) no tienen worker que arrancar.
  if (!manifest?.background?.service_worker) return;

  const scope = `chrome-extension://${extensionId}/`;
  const running = session.serviceWorkers.getAllRunning() as unknown as Record<
    string,
    { scope?: string }
  >;
  const yaCorria = Object.values(running).some((w) => w?.scope === scope);

  try {
    await session.serviceWorkers.startWorkerForScope(scope);
  } catch (err) {
    logger.warn(`[ext] no se pudo arrancar el service worker de ${extensionId}`, err);
    return;
  }

  if (!yaCorria && options.esperarInicializacion) {
    await new Promise((resolve) => setTimeout(resolve, MARGEN_ARRANQUE_FRIO_MS));
  }
}

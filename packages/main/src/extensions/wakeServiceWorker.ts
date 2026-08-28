import type { Session } from 'electron';
import { logger } from '../logger';

/**
 * Arranca el service worker de una extensión MV3 si Chromium lo había
 * suspendido.
 *
 * Por qué hace falta: Chromium duerme el service worker de una extensión tras
 * ~30 s sin actividad. En Chrome, cualquier evento de la API (`tabs.onActivated`,
 * un mensaje, abrir el popup…) lo despierta antes de entregarlo. En Electron no:
 * los mensajes que salen del proceso principal (los que emite
 * electron-chrome-extensions) llegan a un worker parado y se pierden, y mientras
 * el worker está parado la mensajería de la extensión con sus content scripts no
 * fluye. El síntoma en Bitwarden es exactamente el que reporta el usuario: el
 * popup abre, muestra las sugerencias, y al pulsar "Fill" contesta "Unable to
 * autofill the selected item on this page", porque `collectPageDetails` no
 * obtiene respuesta de la página.
 *
 * Se llama justo antes de usar la extensión (abrir su popup, disparar uno de sus
 * atajos). Resuelve en cuanto el worker está listo — unos 200 ms si estaba
 * parado, inmediato si ya corría.
 */
export async function wakeExtensionServiceWorker(
  session: Session,
  extensionId: string,
): Promise<void> {
  const ext = session.extensions
    .getAllExtensions()
    .find((e) => e.id === extensionId);
  const manifest = ext?.manifest as
    | { background?: { service_worker?: string } }
    | undefined;
  // Las extensiones MV2 (background page) no tienen worker que arrancar.
  if (!manifest?.background?.service_worker) return;

  try {
    await session.serviceWorkers.startWorkerForScope(
      `chrome-extension://${extensionId}/`,
    );
  } catch (err) {
    logger.warn(`[ext] no se pudo arrancar el service worker de ${extensionId}`, err);
  }
}

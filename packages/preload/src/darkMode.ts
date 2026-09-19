import { ipcRenderer } from 'electron';
import {
  disable as disableDarkReader,
  enable as enableDarkReader,
  isEnabled as isDarkReaderEnabled,
  setFetchMethod,
} from 'darkreader';
import {
  DARKMODE_TAB_STATE_OFF,
  isPageBackgroundDark,
  type DarkModeTabState,
} from '@vela/shared/darkmode/policy';

// ─── Modo oscuro forzado de las webs (Dark Reader) ───────────────────────────
// Dark Reader corre aquí, en el mundo aislado del preload (contextIsolation):
// la página no ve sus variables ni puede desactivarlo. Trabaja sobre el DOM,
// que es común a los dos mundos. Solo inyecta en el mundo de la página el
// pequeño proxy de CSSOM que trae la librería (el mismo que usa la extensión)
// para enterarse de las reglas que añaden los CSS-in-JS; si la CSP de la web
// prohíbe scripts inline, ese proxy no llega a ejecutarse y esas reglas se
// quedan sin adaptar.
//
// El main decide qué documento lo lleva (ajustes del perfil, excepciones por
// sitio y tema de Vela). Se pregunta de forma síncrona al arrancar el
// documento, antes de que se pinte nada, para que no haya destello blanco:
// Dark Reader pone de inmediato un fondo oscuro provisional mientras procesa
// las hojas de estilo. Los cambios posteriores llegan por `darkmode:update`.

const CH_GET_STATE_SYNC = 'darkmode:get-state-sync';
const CH_FETCH = 'darkmode:fetch';
const CH_NATIVE_DARK = 'darkmode:native-dark';
const CH_UPDATE = 'darkmode:update';

/** Documentos a los que tiene sentido aplicarlo (no imágenes, PDF, XML…). */
const THEMEABLE_CONTENT_TYPES = new Set(['text/html', 'application/xhtml+xml', 'text/plain']);

let state: DarkModeTabState = DARKMODE_TAB_STATE_OFF;
/** La web ya era oscura sin Dark Reader. */
let nativelyDark = false;
let reportedNativelyDark: boolean | null = null;

function isTabState(value: unknown): value is DarkModeTabState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<DarkModeTabState>;
  return (
    typeof v.enabled === 'boolean' &&
    typeof v.forced === 'boolean' &&
    typeof v.brightness === 'number' &&
    typeof v.contrast === 'number'
  );
}

function isThemeableDocument(): boolean {
  return window.top === window && THEMEABLE_CONTENT_TYPES.has(document.contentType);
}

function whenDocumentElement(cb: () => void): void {
  if (document.documentElement) {
    cb();
    return;
  }
  const observer = new MutationObserver(() => {
    if (!document.documentElement) return;
    observer.disconnect();
    cb();
  });
  observer.observe(document, { childList: true });
}

function apply(): void {
  const wanted = state.enabled && (state.forced || !nativelyDark);
  if (wanted) {
    whenDocumentElement(() => {
      try {
        enableDarkReader({ brightness: state.brightness, contrast: state.contrast, sepia: 0 });
      } catch (err) {
        console.warn('[vela] Dark Reader no pudo activarse', err);
      }
    });
  } else if (isDarkReaderEnabled()) {
    try {
      disableDarkReader();
    } catch (err) {
      console.warn('[vela] Dark Reader no pudo desactivarse', err);
    }
  }
}

/**
 * ¿Era oscura la página sin Dark Reader? Se desactivan un instante sus
 * hojas (`style.darkreader`), se leen los estilos computados y se vuelven a
 * activar, todo en la misma tarea: el navegador no llega a pintar el estado
 * intermedio.
 */
function measureNativelyDark(): boolean {
  const html = document.documentElement;
  if (!html) return false;
  const paused: CSSStyleSheet[] = [];
  document.querySelectorAll('style.darkreader').forEach((el) => {
    const sheet = (el as HTMLStyleElement).sheet;
    if (sheet && !sheet.disabled) {
      sheet.disabled = true;
      paused.push(sheet);
    }
  });
  try {
    const htmlStyle = getComputedStyle(html);
    return isPageBackgroundDark({
      bodyBackground: document.body ? getComputedStyle(document.body).backgroundColor : null,
      htmlBackground: htmlStyle.backgroundColor,
      rootColorScheme: htmlStyle.colorScheme,
      prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    });
  } catch {
    return false;
  } finally {
    for (const sheet of paused) sheet.disabled = false;
  }
}

function detectNativelyDark(): void {
  // Una vez vista oscura se queda así: al quitar Dark Reader no se vuelve a
  // medir, y una segunda lectura con los estilos a medio cargar no debe
  // devolverla a claro.
  if (!nativelyDark) nativelyDark = measureNativelyDark();
  if (reportedNativelyDark !== nativelyDark) {
    reportedNativelyDark = nativelyDark;
    ipcRenderer.send(CH_NATIVE_DARK, { dark: nativelyDark });
  }
  if (nativelyDark && !state.forced && isDarkReaderEnabled()) apply();
}

/**
 * Hojas de estilo e imágenes de otro origen: CORS no deja leerlas desde la
 * página, así que las pide el main (sin credenciales, solo a URLs públicas y
 * solo CSS o imágenes). Si falla, Dark Reader deja ese recurso sin adaptar.
 * Las del mismo origen las sigue pidiendo Dark Reader con `fetch` normal.
 */
async function fetchThroughMain(url: string): Promise<Response> {
  const res = (await ipcRenderer.invoke(CH_FETCH, { url })) as
    | { ok: true; data: { body: Uint8Array; contentType: string } }
    | { ok: false; error: string; details?: unknown };
  if (!res || !res.ok) throw new Error(`Vela: no se pudo leer ${url}`);
  return new Response(res.data.body, {
    status: 200,
    headers: { 'Content-Type': res.data.contentType },
  });
}

export function initDarkMode(): void {
  if (!isThemeableDocument()) return;
  setFetchMethod(fetchThroughMain);

  try {
    const res = ipcRenderer.sendSync(CH_GET_STATE_SYNC, { url: window.location.href }) as unknown;
    if (isTabState(res)) state = res;
  } catch {
    state = DARKMODE_TAB_STATE_OFF;
  }
  apply();

  ipcRenderer.on(CH_UPDATE, (_event, next: unknown) => {
    if (!isTabState(next)) return;
    state = next;
    apply();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', detectNativelyDark, { once: true });
  } else {
    detectNativelyDark();
  }
  // Segunda lectura con todo cargado: hay webs que ponen el fondo tarde.
  window.addEventListener('load', detectNativelyDark, { once: true });
}

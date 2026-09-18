import { app, ipcMain, type WebContents } from 'electron';
import {
  IPC_CHANNELS,
  DARKMODE_TAB_STATE_OFF,
  darkModeFetchSchema,
  darkModeNativeDarkSchema,
  darkModeStateQuerySchema,
  type DarkModeFetchResult,
  type DarkModeTabState,
  type IpcResponse,
} from '@vela/shared';
import type { IpcContext } from './context';
import { isPublicHttpUrl } from '../lib/urlSafety';

/** Tope por respuesta: hojas de estilo e imágenes de fondo, no descargas. */
const MAX_FETCH_BYTES = 4 * 1024 * 1024;

/**
 * Tipos que Dark Reader necesita leer: CSS para generar el tema e imágenes
 * para decidir si invertir un fondo. Cualquier otro se rechaza para que el
 * canal no sirva de proxy genérico.
 */
function isAllowedContentType(contentType: string): boolean {
  const type = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return type === 'text/css' || type.startsWith('image/');
}

/**
 * Canales del modo oscuro de las webs. Los invoca el preload de las
 * pestañas web, así que no llevan `guardTrustedFrame`: a cambio solo
 * atienden a un WebContents que sea una pestaña de usuario enganchada al
 * `DarkModeManager`.
 */
export function registerDarkModeHandlers(ctx: IpcContext): void {
  const isUserTab = (wc: WebContents): boolean =>
    ctx.tabManager.getTabIdForWebContents(wc.id) !== null && ctx.darkMode.isAttached(wc);

  // Síncrono: el preload lo pregunta al arrancar cada documento, antes de que
  // se pinte nada, para no dejar ver la página en blanco. Tiene que responder
  // siempre (returnValue) o el renderer se queda bloqueado.
  ipcMain.on(IPC_CHANNELS.DARKMODE_GET_STATE_SYNC, (event, payload: unknown) => {
    let state: DarkModeTabState = DARKMODE_TAB_STATE_OFF;
    try {
      const parsed = darkModeStateQuerySchema.safeParse(payload);
      const wc = event.sender;
      const isMainFrame = event.senderFrame !== null && event.senderFrame === wc.mainFrame;
      if (parsed.success && isMainFrame && isUserTab(wc)) {
        // La URL del frame es la fuente fiable; la del payload solo cubre el
        // instante en que el frame aún no la expone. En ambos casos solo
        // decide el aspecto de esta misma pestaña.
        const frameUrl = event.senderFrame?.url ?? '';
        const url = frameUrl && frameUrl !== 'about:blank' ? frameUrl : parsed.data.url;
        ctx.darkMode.beginDocument(wc);
        state = ctx.darkMode.stateFor(wc, url);
      }
    } catch (err) {
      ctx.logger.warn('[darkmode] get-state-sync falló', err);
    } finally {
      event.returnValue = state;
    }
  });

  // El preload avisa de si el documento ya era oscuro sin Dark Reader: así el
  // menú contextual y el comando alternan partiendo de lo que se ve.
  ipcMain.on(IPC_CHANNELS.DARKMODE_NATIVE_DARK, (event, payload: unknown) => {
    const parsed = darkModeNativeDarkSchema.safeParse(payload);
    if (!parsed.success) return;
    const wc = event.sender;
    if (event.senderFrame !== wc.mainFrame || !isUserTab(wc)) return;
    ctx.darkMode.setNativelyDark(wc, parsed.data.dark);
  });

  // Hojas de estilo e imágenes de otro origen: Dark Reader las necesita y
  // CORS no le deja pedirlas desde la página. Se piden sin credenciales, solo
  // a URLs públicas y solo para una pestaña que tenga el modo oscuro activo.
  ipcMain.handle(
    IPC_CHANNELS.DARKMODE_FETCH,
    async (event, payload): Promise<IpcResponse<DarkModeFetchResult>> => {
      const parsed = darkModeFetchSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      const wc = event.sender;
      if (!isUserTab(wc) || !ctx.darkMode.isEnabledFor(wc)) {
        return { ok: false, error: 'INVALID_INPUT', details: 'Pestaña sin modo oscuro' };
      }
      // Anti-SSRF: solo http(s) público, nunca loopback/intranet/metadata.
      if (!isPublicHttpUrl(parsed.data.url)) {
        return { ok: false, error: 'INVALID_INPUT', details: 'URL no permitida' };
      }
      try {
        const response = await wc.session.fetch(parsed.data.url, {
          credentials: 'omit',
          redirect: 'error',
          headers: {
            'User-Agent': app.userAgentFallback,
            Accept: 'text/css,image/*;q=0.9,*/*;q=0.1',
          },
        });
        if (!response.ok) {
          return { ok: false, error: 'INTERNAL', details: `HTTP ${String(response.status)}` };
        }
        const contentType = response.headers.get('content-type') ?? '';
        if (!isAllowedContentType(contentType)) {
          return { ok: false, error: 'INVALID_INPUT', details: 'Tipo de contenido no soportado' };
        }
        const declared = Number(response.headers.get('content-length') ?? '0');
        if (declared > MAX_FETCH_BYTES) {
          return { ok: false, error: 'INVALID_INPUT', details: 'Recurso demasiado grande' };
        }
        const body = new Uint8Array(await response.arrayBuffer());
        if (body.byteLength > MAX_FETCH_BYTES) {
          return { ok: false, error: 'INVALID_INPUT', details: 'Recurso demasiado grande' };
        }
        return { ok: true, data: { body, contentType } };
      } catch (err) {
        // Fallo de red o redirección: Dark Reader deja esa hoja sin adaptar.
        return { ok: false, error: 'INTERNAL', details: String(err) };
      }
    },
  );
}

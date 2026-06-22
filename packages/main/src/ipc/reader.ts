import { app, ipcMain, net } from 'electron';
import { IPC_CHANNELS, z, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';
import { isPublicHttpUrl } from '../lib/urlSafety';

const fetchHtmlSchema = z.object({
  url: z.string().url().max(2048),
});

// Tope para no agotar memoria si el origen devuelve un cuerpo enorme.
const MAX_HTML_BYTES = 5 * 1024 * 1024;

export function registerReaderHandlers(_ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.READER_FETCH_HTML,
    async (event, payload): Promise<IpcResponse<{ html: string }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.READER_FETCH_HTML);
      const parsed = fetchHtmlSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      // Anti-SSRF: solo http(s) público, nunca file:/vela:/loopback/intranet.
      if (!isPublicHttpUrl(parsed.data.url)) {
        return { ok: false, error: 'INVALID_INPUT', details: 'URL no permitida' };
      }
      try {
        const response = await net.fetch(parsed.data.url, {
          redirect: 'error',
          headers: {
            'User-Agent': app.userAgentFallback,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es,en;q=0.9',
          },
        });
        if (!response.ok) {
          return {
            ok: false,
            error: 'INTERNAL',
            details: `HTTP ${String(response.status)}`,
          };
        }
        // Solo procesamos HTML; rechazar otros content-types evita usar este
        // canal como proxy genérico de descarga.
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType && !/text\/html|application\/xhtml\+xml|text\/plain|application\/xml/i.test(contentType)) {
          return { ok: false, error: 'INVALID_INPUT', details: 'Tipo de contenido no soportado' };
        }
        const buf = Buffer.from(await response.arrayBuffer());
        if (buf.byteLength > MAX_HTML_BYTES) {
          return { ok: false, error: 'INVALID_INPUT', details: 'Documento demasiado grande' };
        }
        const html = buf.toString('utf-8');
        return { ok: true, data: { html } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.READER_FETCH_HTML);
      }
    },
  );
}

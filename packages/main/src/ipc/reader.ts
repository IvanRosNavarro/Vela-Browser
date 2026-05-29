import { app, ipcMain, net } from 'electron';
import { IPC_CHANNELS, z, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';

const fetchHtmlSchema = z.object({
  url: z.string().url().max(2048),
});

export function registerReaderHandlers(_ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.READER_FETCH_HTML,
    async (_event, payload): Promise<IpcResponse<{ html: string }>> => {
      const parsed = fetchHtmlSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const response = await net.fetch(parsed.data.url, {
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
        const html = await response.text();
        return { ok: true, data: { html } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.READER_FETCH_HTML);
      }
    },
  );
}

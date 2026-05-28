import { clipboard, dialog, ipcMain } from 'electron';
import { IPC_CHANNELS, z, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { resolveWindowId } from './helpers';
import { mapError } from './errors';
import { guardTrustedFrame } from './validate';
import { InvariantViolationError } from '../lib/errors';
import { promises as fs } from 'node:fs';

const captureRegionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const saveFileSchema = z.object({
  dataUrl: z.string().min(1),
  format: z.enum(['png', 'jpeg']),
});

const copyImageSchema = z.object({
  dataUrl: z.string().min(1),
});

function dataUrlToBuffer(dataUrl: string): Buffer {
  const [, b64] = dataUrl.split(',');
  if (!b64) throw new Error('dataUrl inválida');
  return Buffer.from(b64, 'base64');
}

export function registerScreenshotHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.SCREENSHOT_CAPTURE_VISIBLE,
    async (event): Promise<IpcResponse<{ dataUrl: string }>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.SCREENSHOT_CAPTURE_VISIBLE);
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError('screenshot:capture-visible: sin ventana');
        }
        const buf = await ctx.tabManager.captureVisibleForWindow(windowId);
        return { ok: true, data: { dataUrl: `data:image/png;base64,${buf.toString('base64')}` } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SCREENSHOT_CAPTURE_VISIBLE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SCREENSHOT_CAPTURE_REGION,
    async (event, payload): Promise<IpcResponse<{ dataUrl: string }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.SCREENSHOT_CAPTURE_REGION);
      const parsed = captureRegionSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError('screenshot:capture-region: sin ventana');
        }
        const buf = await ctx.tabManager.captureRegionForWindow(windowId, parsed.data);
        return { ok: true, data: { dataUrl: `data:image/png;base64,${buf.toString('base64')}` } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SCREENSHOT_CAPTURE_REGION);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SCREENSHOT_CAPTURE_FULL_PAGE,
    async (event): Promise<IpcResponse<{ dataUrl: string }>> => {
      try {
        guardTrustedFrame(event, IPC_CHANNELS.SCREENSHOT_CAPTURE_FULL_PAGE);
        const windowId = resolveWindowId(event);
        if (windowId === null) {
          throw new InvariantViolationError('screenshot:capture-full-page: sin ventana');
        }
        let buf: Buffer;
        try {
          buf = await ctx.tabManager.captureFullPageForWindow(windowId);
        } catch {
          // fallback a visible si CDP falla
          const wc = ctx.tabManager.getActiveTabWebContents(windowId);
          if (!wc || wc.isDestroyed()) throw new Error('No hay WebContents activo');
          const img = await wc.capturePage();
          buf = img.toJPEG(85);
        }
        return { ok: true, data: { dataUrl: `data:image/jpeg;base64,${buf.toString('base64')}` } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SCREENSHOT_CAPTURE_FULL_PAGE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SCREENSHOT_SAVE_FILE,
    async (event, payload): Promise<IpcResponse<{ saved: boolean }>> => {
      guardTrustedFrame(event, IPC_CHANNELS.SCREENSHOT_SAVE_FILE);
      const parsed = saveFileSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const { format, dataUrl } = parsed.data;
        const ext = format === 'jpeg' ? 'jpg' : 'png';
        const { filePath } = await dialog.showSaveDialog({
          defaultPath: `captura.${ext}`,
          filters: [
            format === 'jpeg'
              ? { name: 'JPEG', extensions: ['jpg', 'jpeg'] }
              : { name: 'PNG', extensions: ['png'] },
          ],
        });
        if (!filePath) return { ok: true, data: { saved: false } };
        await fs.writeFile(filePath, dataUrlToBuffer(dataUrl));
        return { ok: true, data: { saved: true } };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SCREENSHOT_SAVE_FILE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.SCREENSHOT_COPY_IMAGE,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.SCREENSHOT_COPY_IMAGE);
      const parsed = copyImageSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const buf = dataUrlToBuffer(parsed.data.dataUrl);
        const { nativeImage } = await import('electron');
        clipboard.writeImage(nativeImage.createFromBuffer(buf));
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.SCREENSHOT_COPY_IMAGE);
      }
    },
  );
}

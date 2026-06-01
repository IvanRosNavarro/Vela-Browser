import { clipboard, ipcMain } from 'electron';
import { IPC_CHANNELS, z, type IpcResponse } from '@vela/shared';
import { guardTrustedFrame } from './validate';
import { mapError } from './errors';

export function registerClipboardHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CLIPBOARD_WRITE_TEXT,
    (event, rawArgs): IpcResponse<void> => {
      guardTrustedFrame(event, IPC_CHANNELS.CLIPBOARD_WRITE_TEXT);
      const parsed = z.object({ text: z.string() }).safeParse(rawArgs);
      if (!parsed.success) return mapError(new Error('Invalid payload'), IPC_CHANNELS.CLIPBOARD_WRITE_TEXT);
      try {
        clipboard.writeText(parsed.data.text);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.CLIPBOARD_WRITE_TEXT);
      }
    },
  );
}

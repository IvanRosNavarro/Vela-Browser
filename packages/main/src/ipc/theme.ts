import { ipcMain, dialog } from 'electron';
import { promises as fs } from 'node:fs';
import { IPC_CHANNELS, z, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { guardTrustedFrame } from './validate';

const exportFileSchema = z.object({
  theme: z.record(z.string(), z.string()),
  name: z.string().min(1).max(256),
});

export function registerThemeHandlers(_ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.THEME_EXPORT_FILE,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.THEME_EXPORT_FILE);
      const parsed = exportFileSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const { theme, name } = parsed.data;
        const result = await dialog.showSaveDialog({
          title: 'Exportar tema',
          defaultPath: `${name}.vela-theme.json`,
          filters: [{ name: 'Vela Theme', extensions: ['json'] }],
        });
        if (result.canceled || !result.filePath) {
          return { ok: true, data: undefined };
        }
        await fs.writeFile(result.filePath, JSON.stringify(theme, null, 2), 'utf8');
        return { ok: true, data: undefined };
      } catch (err) {
        return { ok: false, error: 'INTERNAL', details: String(err) };
      }
    },
  );
}

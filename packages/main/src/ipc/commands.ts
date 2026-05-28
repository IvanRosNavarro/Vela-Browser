import { ipcMain } from 'electron';
import { IPC_CHANNELS, z, type IpcResponse } from '@vela/shared';
import type { CommandRegistry } from '../commands/registry';
import { buildContext } from '../commands/context';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { resolveWindowId } from './helpers';
import { guardTrustedFrame } from './validate';

const executeSchema = z.object({
  commandId: z.string().min(1).max(256),
  args: z.unknown().optional(),
  targetWindowId: z.number().int().optional(),
});

export function registerCommandsHandlers(
  ctx: IpcContext,
  registry: CommandRegistry,
): void {
  ipcMain.handle(
    IPC_CHANNELS.COMMAND_EXECUTE,
    async (event, payload): Promise<IpcResponse<void>> => {
      guardTrustedFrame(event, IPC_CHANNELS.COMMAND_EXECUTE);
      const parsed = executeSchema.safeParse(payload);
      if (!parsed.success) {
        return { ok: false, error: 'INVALID_INPUT', details: parsed.error.flatten() };
      }
      try {
        const windowId = parsed.data.targetWindowId ?? resolveWindowId(event);
        const cmdCtx = buildContext(ctx, windowId);
        await registry.execute(parsed.data.commandId, cmdCtx, parsed.data.args);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.COMMAND_EXECUTE);
      }
    },
  );
}

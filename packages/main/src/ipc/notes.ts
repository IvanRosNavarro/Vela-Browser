import { ipcMain } from 'electron';
import { IPC_CHANNELS, type IpcResponse } from '@vela/shared';
import type { IpcContext } from './context';
import { mapError } from './errors';
import { getReposForFrame, getFrameContext } from './helpers';
import { loadYDocWithSync } from '../sync/yjs-sync';
import type { QuickNote } from '../storage/repositories/QuickNotesRepository';
import { z } from '@vela/shared';

const notesGetSchema = z.object({ workspaceId: z.string().min(1) });
const notesSaveSchema = z.object({ workspaceId: z.string().min(1), content: z.string() });
const notesDeleteSchema = z.object({ workspaceId: z.string().min(1) });

export function registerNotesHandlers(ctx: IpcContext): void {
  ipcMain.handle(
    IPC_CHANNELS.NOTES_GET,
    async (event, payload): Promise<IpcResponse<QuickNote | null>> => {
      try {
        const { workspaceId } = notesGetSchema.parse(payload);
        const repos = getReposForFrame(event, ctx);
        return { ok: true, data: repos.quickNotes.get(workspaceId) };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTES_GET);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTES_SAVE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { workspaceId, content } = notesSaveSchema.parse(payload);
        const repos = getReposForFrame(event, ctx);
        const { profileId } = getFrameContext(event, ctx);
        const sync = ctx.syncManagers.get(profileId);

        if (sync?.isConfigured()) {
          // Con sync activo la nota vive en un Y.Doc: escribir ahí dispara el
          // observer que persiste en quick_notes y sube el estado CRDT.
          const doc = await loadYDocWithSync(profileId, workspaceId, repos, sync);
          const text = doc.getText('content');
          if (text.toString() !== content) {
            doc.transact(() => {
              text.delete(0, text.length);
              text.insert(0, content);
            });
          }
        } else {
          repos.quickNotes.upsert(workspaceId, content);
        }
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTES_SAVE);
      }
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.NOTES_DELETE,
    async (event, payload): Promise<IpcResponse<void>> => {
      try {
        const { workspaceId } = notesDeleteSchema.parse(payload);
        const repos = getReposForFrame(event, ctx);
        repos.quickNotes.delete(workspaceId);
        return { ok: true, data: undefined };
      } catch (err) {
        return mapError(err, IPC_CHANNELS.NOTES_DELETE);
      }
    },
  );
}

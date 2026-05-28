import * as Y from 'yjs';
import type { ProfileRepositories } from '../profiles/ProfileManager';
import type { SyncManager } from './SyncManager';

const ydocs = new Map<string, Y.Doc>();

export function getYDoc(workspaceId: string): Y.Doc {
  if (!ydocs.has(workspaceId)) {
    ydocs.set(workspaceId, new Y.Doc());
  }
  return ydocs.get(workspaceId)!;
}

export function disposeYDoc(workspaceId: string): void {
  const doc = ydocs.get(workspaceId);
  if (doc) {
    doc.destroy();
    ydocs.delete(workspaceId);
  }
}

/**
 * Carga el Y.Doc de un workspace:
 * 1. Aplica el estado CRDT local desde quick_notes.ydoc_state.
 * 2. Si hay sync, obtiene el estado remoto y lo fusiona (merge sin pérdida).
 * 3. Registra un observer que persiste y sube cambios en cada update.
 */
export async function loadYDocWithSync(
  workspaceId: string,
  repos: ProfileRepositories,
  syncManager: SyncManager | null,
): Promise<Y.Doc> {
  const doc = getYDoc(workspaceId);

  const localNote = repos.quickNotes.get(workspaceId);
  if (localNote?.ydocState) {
    try {
      Y.applyUpdate(doc, Buffer.from(localNote.ydocState, 'base64'));
    } catch {
      // estado corrupto — ignorar y partir de cero
    }
  }

  if (syncManager?.isConfigured()) {
    const remoteState = await syncManager.pullYDoc(workspaceId);
    if (remoteState) {
      try {
        Y.applyUpdate(doc, remoteState);
      } catch {
        // estado remoto corrupto — ignorar
      }
    }
  }

  doc.on('update', async (_update: Uint8Array) => {
    const state = Y.encodeStateAsUpdate(doc);
    const content = doc.getText('content').toString();
    const ydocState = Buffer.from(state).toString('base64');

    repos.quickNotes.upsertWithYdoc(workspaceId, content, ydocState);

    if (syncManager?.isConfigured()) {
      await syncManager.pushYDoc(workspaceId, Buffer.from(state)).catch(() => {
        // silenciar errores de red — el estado local está guardado
      });
    }
  });

  return doc;
}

import * as Y from 'yjs';
import type { ProfileRepositories } from '../profiles/ProfileManager';
import type { SyncManager } from './SyncManager';

/**
 * Docs vivos, indexados por `profileId:workspaceId`. La clave incluye el
 * perfil porque dos perfiles pueden tener workspaces con el mismo id tras
 * sincronizar, y compartir el Y.Doc mezclaría sus notas.
 */
const ydocs = new Map<string, Y.Doc>();

/** Docs a los que ya se les enganchó el observer de persistencia. */
const observed = new Set<string>();

function docKey(profileId: string, workspaceId: string): string {
  return `${profileId}:${workspaceId}`;
}

export function getYDoc(profileId: string, workspaceId: string): Y.Doc {
  const key = docKey(profileId, workspaceId);
  if (!ydocs.has(key)) {
    ydocs.set(key, new Y.Doc());
  }
  return ydocs.get(key)!;
}

export function disposeYDoc(profileId: string, workspaceId: string): void {
  const key = docKey(profileId, workspaceId);
  const doc = ydocs.get(key);
  if (doc) {
    doc.destroy();
    ydocs.delete(key);
    observed.delete(key);
  }
}

/**
 * Carga el Y.Doc de un workspace:
 * 1. Aplica el estado CRDT local desde quick_notes.ydoc_state.
 * 2. Si hay sync, obtiene el estado remoto y lo fusiona (merge sin pérdida).
 * 3. Registra —una sola vez por doc— un observer que persiste y sube cambios.
 *
 * Es idempotente: llamarlo de nuevo refresca desde el servidor sin duplicar
 * observers ni reaplicar el estado local ya presente.
 */
export async function loadYDocWithSync(
  profileId: string,
  workspaceId: string,
  repos: ProfileRepositories,
  syncManager: SyncManager | null,
): Promise<Y.Doc> {
  const key = docKey(profileId, workspaceId);
  const doc = getYDoc(profileId, workspaceId);

  const localNote = repos.quickNotes.get(workspaceId);
  if (localNote?.ydocState) {
    try {
      Y.applyUpdate(doc, Buffer.from(localNote.ydocState, 'base64'));
    } catch {
      // estado corrupto — ignorar y partir de cero
    }
  } else if (localNote?.content && doc.getText('content').length === 0) {
    // Nota escrita antes de que hubiera sync (solo texto plano, sin CRDT):
    // se siembra en el doc para que llegue al resto de dispositivos.
    doc.getText('content').insert(0, localNote.content);
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

  if (!observed.has(key)) {
    observed.add(key);
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
  }

  // Persistir el resultado de la fusión aunque no haya habido más updates
  // (el observer solo dispara con cambios posteriores a su registro).
  const merged = doc.getText('content').toString();
  if (merged !== (localNote?.content ?? '')) {
    repos.quickNotes.upsertWithYdoc(
      workspaceId,
      merged,
      Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
    );
  }

  return doc;
}

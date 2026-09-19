import { EventEmitter } from 'node:events';

export interface SyncEntityEvent {
  profileId: string;
  type: string;
  id: string;
  data: object | null;
  updatedAt: number;
}

/**
 * Entidad remota que `SyncManager.mergeEntity` acaba de escribir en local.
 * Sirve a quien tenga que reflejar el cambio fuera de la base de datos (p. ej.
 * el corrector ortográfico, que vive en la sesión de Electron).
 */
export interface SyncEntityAppliedEvent {
  profileId: string;
  type: string;
  id: string;
  deleted: boolean;
}

/**
 * Bus global de eventos de sincronización.
 * Los repositorios emiten aquí tras cada mutación cuando tienen profileId.
 * SyncManager escucha y reenvía al servidor (o encola si está offline).
 *
 * Eventos:
 *   - 'entity:changed' (SyncEntityEvent): mutación local que hay que subir.
 *   - 'entity:applied' (SyncEntityAppliedEvent): cambio remoto ya aplicado.
 */
export const syncEvents = new EventEmitter();
syncEvents.setMaxListeners(50);

import { EventEmitter } from 'node:events';

export interface SyncEntityEvent {
  profileId: string;
  type: string;
  id: string;
  data: object | null;
  updatedAt: number;
}

/**
 * Bus global de eventos de sincronización.
 * Los repositorios emiten aquí tras cada mutación cuando tienen profileId.
 * SyncManager escucha y reenvía al servidor (o encola si está offline).
 */
export const syncEvents = new EventEmitter();
syncEvents.setMaxListeners(50);

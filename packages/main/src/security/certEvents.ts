import { EventEmitter } from 'node:events';

interface CertProceedPayload {
  fingerprint: string;
  url: string;
  wcId: number;
}

interface CertBackPayload {
  wcId: number;
}

export declare interface CertEventEmitter {
  on(event: 'proceed', listener: (payload: CertProceedPayload) => void): this;
  on(event: 'back', listener: (payload: CertBackPayload) => void): this;
  emit(event: 'proceed', payload: CertProceedPayload): boolean;
  emit(event: 'back', payload: CertBackPayload): boolean;
}

export class CertEventEmitter extends EventEmitter {}

export const certEvents = new CertEventEmitter();

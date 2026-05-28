import type { IpcErrorCode, IpcResponse } from '@vela/shared';

export class IpcError extends Error {
  readonly code: IpcErrorCode;
  readonly details: unknown;

  constructor(code: IpcErrorCode, details?: unknown) {
    super(`IPC ${code}`);
    this.name = 'IpcError';
    this.code = code;
    this.details = details;
  }
}

export async function call<T>(
  fn: () => Promise<IpcResponse<T>>,
): Promise<T> {
  const res = await fn();
  if (!res.ok) {
    throw new IpcError(res.error, res.details);
  }
  return res.data;
}

export const api = (): Window['api'] => window.api;

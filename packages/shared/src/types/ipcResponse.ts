export type IpcErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CYCLE_DETECTED'
  | 'INVARIANT'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL'
  | 'CANNOT_DELETE_OPEN_PROFILE'
  | 'DUPLICATE_PROFILE_NAME'
  | 'MASTER_PASSWORD_REQUIRED'
  | 'INVALID_MASTER_PASSWORD'
  | 'UNLOCK_RATE_LIMITED'
  | 'INVALID_SHORTCUT'
  | 'RESERVED_SHORTCUT'
  | 'INVALID_JSON'
  | 'INVALID_FORMAT'
  | 'CANCELLED'
  | 'NO_OPTIONS_PAGE'
  | 'NO_WORKSPACE'
  | 'NO_WINDOW'
  | 'NO_ACTIVE_TAB';

export type IpcResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: IpcErrorCode; details?: unknown };

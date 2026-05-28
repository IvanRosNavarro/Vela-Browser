import type { IpcResponse } from '@vela/shared';
import {
  CycleError,
  InvariantViolationError,
  NotFoundError,
  NotImplementedError,
} from '../lib/errors';
import {
  DuplicateProfileNameError,
  ProfileNotFoundError,
} from '../storage/repositories';
import {
  InvalidMasterPasswordError,
  MasterPasswordRequiredError,
} from '../profiles/ProfileManager';
import { CannotDeleteOpenProfileError } from '../profiles/ProfileWindowManager';
import { UnlockRateLimitError } from '../profiles/UnlockRateLimiter';
import { logger } from '../logger';

export function mapError(err: unknown, context: string): IpcResponse<never> {
  if (err instanceof ProfileNotFoundError) {
    return {
      ok: false,
      error: 'NOT_FOUND',
      details: { entity: 'Profile', id: err.profileId },
    };
  }
  if (err instanceof NotFoundError) {
    return {
      ok: false,
      error: 'NOT_FOUND',
      details: { entity: err.entity, id: err.id },
    };
  }
  if (err instanceof CycleError) {
    return { ok: false, error: 'CYCLE_DETECTED', details: err.message };
  }
  if (err instanceof InvariantViolationError) {
    return { ok: false, error: 'INVARIANT', details: err.message };
  }
  if (err instanceof NotImplementedError) {
    return { ok: false, error: 'NOT_IMPLEMENTED', details: err.message };
  }
  if (err instanceof DuplicateProfileNameError) {
    return {
      ok: false,
      error: 'DUPLICATE_PROFILE_NAME',
      details: { name: err.name_ },
    };
  }
  if (err instanceof CannotDeleteOpenProfileError) {
    return {
      ok: false,
      error: 'CANNOT_DELETE_OPEN_PROFILE',
      details: { profileId: err.profileId },
    };
  }
  if (err instanceof MasterPasswordRequiredError) {
    return {
      ok: false,
      error: 'MASTER_PASSWORD_REQUIRED',
      details: { profileId: err.profileId },
    };
  }
  if (err instanceof InvalidMasterPasswordError) {
    return {
      ok: false,
      error: 'INVALID_MASTER_PASSWORD',
      details: {
        profileId: err.profileId,
        failedAttempts: err.failedAttempts,
      },
    };
  }
  if (err instanceof UnlockRateLimitError) {
    return {
      ok: false,
      error: 'UNLOCK_RATE_LIMITED',
      details: {
        profileId: err.profileId,
        retryAfterMs: err.retryAfterMs,
        failedAttempts: err.failedAttempts,
      },
    };
  }
  logger.error(`[ipc] error inesperado en ${context}`, err);
  return { ok: false, error: 'INTERNAL' };
}

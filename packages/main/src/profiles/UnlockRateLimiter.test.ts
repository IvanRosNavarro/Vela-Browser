import { describe, expect, it } from 'vitest';
import {
  UnlockRateLimitError,
  UnlockRateLimiter,
} from './UnlockRateLimiter';

describe('UnlockRateLimiter', () => {
  function build(now: { value: number }, max = 5, windowMs = 30_000) {
    return new UnlockRateLimiter(() => now.value, max, windowMs);
  }

  it('permite los primeros N fallos sin throttling', () => {
    const now = { value: 0 };
    const rl = build(now);
    for (let i = 0; i < 5; i++) {
      rl.ensureCanAttempt('p');
      const { failedAttempts } = rl.recordFailure('p');
      expect(failedAttempts).toBe(i + 1);
    }
  });

  it('lanza UnlockRateLimitError tras alcanzar el umbral', () => {
    const now = { value: 0 };
    const rl = build(now);
    for (let i = 0; i < 5; i++) {
      rl.ensureCanAttempt('p');
      rl.recordFailure('p');
    }
    // El 6º intento dentro de la ventana debe estar bloqueado.
    expect(() => rl.ensureCanAttempt('p')).toThrow(UnlockRateLimitError);
  });

  it('vuelve a permitir intentos cuando el cooldown expira', () => {
    const now = { value: 0 };
    const rl = build(now);
    for (let i = 0; i < 5; i++) {
      rl.ensureCanAttempt('p');
      rl.recordFailure('p');
    }
    now.value = 30_000;
    expect(() => rl.ensureCanAttempt('p')).not.toThrow();
  });

  it('limpia el contador en éxito', () => {
    const now = { value: 0 };
    const rl = build(now);
    rl.recordFailure('p');
    rl.recordFailure('p');
    rl.recordSuccess('p');
    // Tras éxito, los siguientes 5 intentos vuelven a estar permitidos.
    for (let i = 0; i < 5; i++) {
      rl.ensureCanAttempt('p');
      rl.recordFailure('p');
    }
    expect(() => rl.ensureCanAttempt('p')).toThrow(UnlockRateLimitError);
  });

  it('cada profileId tiene contador independiente', () => {
    const now = { value: 0 };
    const rl = build(now);
    for (let i = 0; i < 5; i++) {
      rl.recordFailure('a');
    }
    expect(() => rl.ensureCanAttempt('a')).toThrow(UnlockRateLimitError);
    expect(() => rl.ensureCanAttempt('b')).not.toThrow();
  });
});

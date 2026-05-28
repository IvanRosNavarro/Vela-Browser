/**
 * Rate limit local de intentos de unlock por perfil. Sin persistencia: si
 * la app se reinicia, los contadores se reinician — basta para frenar
 * fuerza bruta interactiva. Para protección real contra ataque offline,
 * la dificultad de Argon2id (Prompt 7) es la que cuenta.
 *
 *  - Hasta 5 fallos por perfil sin penalización.
 *  - A partir del 6º fallo, hay una espera de 30s entre intentos.
 */
const MAX_ATTEMPTS_BEFORE_THROTTLE = 5;
const THROTTLE_WINDOW_MS = 30_000;

interface AttemptState {
  failedAttempts: number;
  nextAttemptAt: number;
}

export class UnlockRateLimitError extends Error {
  readonly profileId: string;
  readonly retryAfterMs: number;
  readonly failedAttempts: number;
  constructor(profileId: string, retryAfterMs: number, failedAttempts: number) {
    super(
      `Profile ${profileId} unlock rate limited; retry in ${retryAfterMs}ms`,
    );
    this.name = 'UnlockRateLimitError';
    this.profileId = profileId;
    this.retryAfterMs = retryAfterMs;
    this.failedAttempts = failedAttempts;
  }
}

export class UnlockRateLimiter {
  private readonly state = new Map<string, AttemptState>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxAttempts = MAX_ATTEMPTS_BEFORE_THROTTLE,
    private readonly windowMs = THROTTLE_WINDOW_MS,
  ) {}

  /**
   * Comprueba si se puede intentar el unlock ahora. Si el perfil está en
   * cooldown lanza UnlockRateLimitError con retryAfterMs.
   */
  ensureCanAttempt(profileId: string): void {
    const entry = this.state.get(profileId);
    if (!entry) return;
    if (entry.failedAttempts < this.maxAttempts) return;
    const remaining = entry.nextAttemptAt - this.now();
    if (remaining > 0) {
      throw new UnlockRateLimitError(profileId, remaining, entry.failedAttempts);
    }
  }

  recordFailure(profileId: string): { failedAttempts: number } {
    const entry = this.state.get(profileId) ?? {
      failedAttempts: 0,
      nextAttemptAt: 0,
    };
    entry.failedAttempts += 1;
    if (entry.failedAttempts >= this.maxAttempts) {
      entry.nextAttemptAt = this.now() + this.windowMs;
    }
    this.state.set(profileId, entry);
    return { failedAttempts: entry.failedAttempts };
  }

  recordSuccess(profileId: string): void {
    this.state.delete(profileId);
  }

  reset(profileId: string): void {
    this.state.delete(profileId);
  }
}

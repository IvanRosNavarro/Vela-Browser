import type {
  IntegrationAccount,
  IntegrationProviderId,
  PullRequestSummary,
} from '@vela/shared';

/** Credencial ya descifrada. Solo existe en memoria durante la petición. */
export interface ProviderCredential {
  token: string;
  authMethod: IntegrationAccount['authMethod'];
}

export interface DeviceAuthorization {
  userCode: string;
  verificationUri: string;
  deviceCode: string;
  /** Segundos que el proveedor pide esperar entre sondeos. */
  intervalSec: number;
  expiresAt: number;
}

export class ProviderAuthError extends Error {
  /** true cuando la credencial ya no sirve y hay que volver a conectar. */
  readonly needsReconnect: boolean;
  constructor(message: string, needsReconnect = true) {
    super(message);
    this.name = 'ProviderAuthError';
    this.needsReconnect = needsReconnect;
  }
}

export class ProviderRateLimitError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super('Límite de peticiones alcanzado');
    this.name = 'ProviderRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Un proveedor sabe autenticarse y devolver las PRs que conciernen al usuario.
 * Nada más: el ciclo de sondeo, la deduplicación y las notificaciones viven en
 * `IntegrationsService`, iguales para todos.
 */
export interface PrProvider {
  readonly id: IntegrationProviderId;
  /** false si el proveedor no ofrece autorización por dispositivo. */
  readonly supportsDeviceFlow: boolean;

  startDeviceAuthorization(clientId: string): Promise<DeviceAuthorization>;
  /** Sondea hasta que el usuario autoriza, caduca o cancela. */
  pollDeviceAuthorization(
    clientId: string,
    auth: DeviceAuthorization,
    signal: AbortSignal,
  ): Promise<string>;

  /** Comprueba la credencial y describe la cuenta. */
  verify(credential: ProviderCredential): Promise<IntegrationAccount>;

  /**
   * PRs abiertas que conciernen al usuario ahora mismo. El servicio compara el
   * resultado con lo ya visto para decidir qué notificar.
   */
  listRelevant(
    credential: ProviderCredential,
    account: IntegrationAccount,
  ): Promise<PullRequestSummary[]>;
}

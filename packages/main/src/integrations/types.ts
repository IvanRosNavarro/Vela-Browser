import type {
  IntegrationAccount,
  IntegrationItem,
  IntegrationProviderId,
  IntegrationReason,
} from '@vela/shared';

/** Credencial ya descifrada. Solo existe en memoria durante la petición. */
export interface ProviderCredential {
  token: string;
  authMethod: IntegrationAccount['authMethod'];
  /** Email de la cuenta de Atlassian: sus API tokens van con él en Basic auth. */
  email?: string;
  /** Sitio de Jira ya normalizado (`acme.atlassian.net`). */
  site?: string;
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
 * Un proveedor sabe autenticarse y devolver lo que concierne al usuario. Nada
 * más: el ciclo de sondeo, la deduplicación y las notificaciones viven en
 * `IntegrationsService`, iguales para todos.
 */
export interface PrProvider {
  readonly id: IntegrationProviderId;
  /** false si el proveedor no ofrece autorización por dispositivo. */
  readonly supportsDeviceFlow: boolean;
  /**
   * Cada cuánto sondear, si el proveedor necesita ir más despacio que el ritmo
   * común (Bitbucket recorre repos y tiene un límite de 1000 peticiones/hora).
   */
  readonly pollIntervalMs?: number;

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
   * Lo que concierne al usuario ahora mismo. El servicio compara el resultado
   * con lo ya visto para decidir qué notificar.
   */
  listRelevant(
    credential: ProviderCredential,
    account: IntegrationAccount,
  ): Promise<IntegrationItem[]>;

  /** Página de la plataforma con todo lo pendiente, para el aviso resumen. */
  overviewUrl(account: IntegrationAccount): string;

  /**
   * Quién hizo el último cambio de un elemento que se ha movido y qué fue. Lo
   * consulta el servicio solo para lo que ha cambiado desde la ronda anterior,
   * así que puede permitirse una petición por elemento.
   *
   * Devuelve `null` cuando el cambio lo hizo el propio usuario: no se le avisa
   * de lo que acaba de hacer él. `isNew` distingue un elemento que aparece por
   * primera vez de uno ya visto que se ha actualizado, porque cada plataforma
   * decide si aparecer ya es noticia.
   *
   * Opcional: sin él, todo cambio se notifica con el motivo del listado.
   */
  explainChange?(
    credential: ProviderCredential,
    account: IntegrationAccount,
    item: IntegrationItem,
    isNew: boolean,
  ): Promise<{ reason: IntegrationReason } | null>;
}

/**
 * Integraciones con plataformas de trabajo: pull requests de GitHub y
 * Bitbucket, e issues de Jira.
 *
 * El navegador sondea la plataforma desde main y convierte lo que encuentra en
 * notificaciones de Vela. Cada plataforma es un proveedor; el ciclo de sondeo,
 * la deduplicación y los avisos son comunes a todos.
 */

export type IntegrationProviderId = 'github' | 'bitbucket' | 'jira';

export const INTEGRATION_PROVIDERS: readonly IntegrationProviderId[] = [
  'github',
  'bitbucket',
  'jira',
];

export const INTEGRATION_PROVIDER_LABELS: Record<IntegrationProviderId, string> = {
  github: 'GitHub',
  bitbucket: 'Bitbucket',
  jira: 'Jira',
};

/**
 * Cómo se autenticó la cuenta. Condiciona qué puede leer el token y, con ello,
 * cuánto detalle traen los avisos:
 *  - `device-flow`: OAuth clásico de GitHub con scopes `notifications` + `repo`.
 *    Da acceso al buzón `/notifications`, que ya viene clasificado por motivo.
 *  - `token`: token pegado a mano. En GitHub es un PAT fine-grained (permiso
 *    mínimo, sin buzón); en Bitbucket y Jira es un API token de Atlassian,
 *    que es la única vía: su OAuth exige un client secret y no admite PKCE.
 */
export type IntegrationAuthMethod = 'device-flow' | 'token';

export type IntegrationPhase =
  | 'disconnected'
  | 'awaiting-authorization'
  | 'connected'
  | 'error';

export interface IntegrationAccount {
  provider: IntegrationProviderId;
  /** Nombre visible en la plataforma. */
  login: string;
  authMethod: IntegrationAuthMethod;
  /** true cuando el token permite leer el buzón de notificaciones (GitHub). */
  hasInbox: boolean;
  connectedAt: number;
  /**
   * Identificador estable del usuario en la plataforma, para reconocer sus
   * propios cambios y no avisarle de ellos (uuid en Bitbucket, accountId en Jira).
   */
  accountId?: string;
  /** Sitio de Jira (`acme.atlassian.net`). */
  site?: string;
  /**
   * Base de la API de Jira. Es el propio sitio con tokens clásicos; con tokens
   * con scopes, Atlassian solo los acepta a través de su pasarela
   * `api.atlassian.com/ex/jira/{cloudId}`.
   */
  apiBase?: string;
}

/**
 * Por qué este elemento te concierne. Los valores de pull request siguen los
 * `reason` del buzón de GitHub; `reviewed` y `updated` cubren lo que Bitbucket y
 * Jira cuentan en su historial de actividad.
 */
export type IntegrationReason =
  | 'review_requested'
  | 'author'
  | 'assign'
  | 'mention'
  | 'comment'
  | 'ci_activity'
  | 'reviewed'
  | 'updated'
  | 'involved';

export type IntegrationItemKind = 'pull-request' | 'issue';

export interface IntegrationItem {
  /** Estable entre sondeos: `github:acme/web#7`, `jira:acme.atlassian.net:WEB-12`. */
  id: string;
  provider: IntegrationProviderId;
  /**
   * Las pull requests entran en el contador de la barra de título; los issues
   * no, porque los asignados suelen ser el backlog entero y el número dejaría de
   * decir nada.
   */
  kind: IntegrationItemKind;
  /** `owner/nombre` en las PRs; la clave del proyecto en Jira. */
  repo: string;
  number: number;
  /** Referencia para mostrar: `acme/web#7`, `WEB-12`. */
  ref: string;
  title: string;
  /** URL de la web, lista para abrir en una pestaña. */
  url: string;
  reason: IntegrationReason;
  updatedAt: number;
  isDraft: boolean;
}

export interface IntegrationsStatus {
  provider: IntegrationProviderId;
  phase: IntegrationPhase;
  account: IntegrationAccount | null;
  /** Mensaje para la interfaz; nunca incluye el token. */
  error: string | null;
  enabled: boolean;
  /** Elementos que te conciernen ahora mismo, más reciente primero. */
  pending: IntegrationItem[];
  lastCheckAt: number | null;
  checking: boolean;
}

/** Datos que el usuario necesita para autorizar el dispositivo (GitHub). */
export interface DeviceFlowPrompt {
  userCode: string;
  verificationUri: string;
  expiresAt: number;
}

export const INTEGRATION_REASON_LABELS: Record<IntegrationReason, string> = {
  review_requested: 'Te han pedido revisión',
  author: 'Tu pull request',
  assign: 'Te lo han asignado',
  mention: 'Te han mencionado',
  comment: 'Nuevo comentario',
  ci_activity: 'Integración continua',
  reviewed: 'Nueva revisión',
  updated: 'Cambios de otra persona',
  involved: 'Te afecta',
};

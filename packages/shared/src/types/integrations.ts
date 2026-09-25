/**
 * Integraciones con plataformas de código (Fase: avisos de pull requests).
 *
 * El navegador sondea la plataforma desde main y convierte lo que encuentra en
 * notificaciones de Vela. Hoy solo GitHub; la interfaz está pensada para que
 * Bitbucket y Jira entren como proveedores nuevos sin tocar nada de esto.
 */

export type IntegrationProviderId = 'github';

/**
 * Cómo se autenticó la cuenta. Condiciona qué puede leer el token y, con ello,
 * cuánto detalle traen los avisos:
 *  - `device-flow`: OAuth clásico con scopes `notifications` + `repo`. Da acceso
 *    al buzón `/notifications`, que ya viene clasificado por motivo.
 *  - `token`: PAT fine-grained pegado a mano. Permiso mínimo, pero GitHub no
 *    deja usar el buzón con él: hay que sondear por búsqueda y el motivo se
 *    deduce, no se lee.
 */
export type IntegrationAuthMethod = 'device-flow' | 'token';

export type IntegrationPhase =
  | 'disconnected'
  | 'awaiting-authorization'
  | 'connected'
  | 'error';

export interface IntegrationAccount {
  provider: IntegrationProviderId;
  /** Nombre de usuario en la plataforma. */
  login: string;
  authMethod: IntegrationAuthMethod;
  /** true cuando el token permite leer el buzón de notificaciones. */
  hasInbox: boolean;
  connectedAt: number;
}

/**
 * Por qué esta PR te concierne. Los valores siguen los `reason` del buzón de
 * GitHub; con PAT fine-grained solo se distinguen `review_requested` y
 * `author`, y el resto cae en `involved`.
 */
export type PullRequestReason =
  | 'review_requested'
  | 'author'
  | 'assign'
  | 'mention'
  | 'comment'
  | 'ci_activity'
  | 'involved';

export interface PullRequestSummary {
  /** `${provider}:${repo}#${number}` — estable entre sondeos. */
  id: string;
  provider: IntegrationProviderId;
  /** `owner/nombre`. */
  repo: string;
  number: number;
  title: string;
  /** URL de la web, lista para abrir en una pestaña. */
  url: string;
  reason: PullRequestReason;
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
  /** PRs abiertas que te conciernen ahora mismo, más reciente primero. */
  pending: PullRequestSummary[];
  lastCheckAt: number | null;
  checking: boolean;
}

/** Datos que el usuario necesita para autorizar el dispositivo. */
export interface DeviceFlowPrompt {
  userCode: string;
  verificationUri: string;
  expiresAt: number;
}

export const PULL_REQUEST_REASON_LABELS: Record<PullRequestReason, string> = {
  review_requested: 'Te han pedido revisión',
  author: 'Tu pull request',
  assign: 'Te la han asignado',
  mention: 'Te han mencionado',
  comment: 'Nuevo comentario',
  ci_activity: 'Integración continua',
  involved: 'Te afecta',
};

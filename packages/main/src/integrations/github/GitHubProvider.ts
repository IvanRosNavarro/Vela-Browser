import type {
  IntegrationAccount,
  IntegrationItem,
  IntegrationReason,
} from '@vela/shared';
import {
  ProviderAuthError,
  ProviderRateLimitError,
  type DeviceAuthorization,
  type PrProvider,
  type ProviderCredential,
} from '../types';
import { fetchJson } from '../fetchJson';

const API = 'https://api.github.com';
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';

/**
 * `notifications` da el buzón ya clasificado; `repo` es lo que GitHub exige
 * para ver las PRs de repositorios privados. No se pide nada más: Vela no
 * escribe nunca en GitHub.
 */
export const GITHUB_SCOPES = 'notifications,repo';

const USER_AGENT = 'Vela-Browser';

interface GhUser {
  login: string;
}

interface GhSearchItem {
  number: number;
  title: string;
  html_url: string;
  updated_at: string;
  draft?: boolean;
  user?: { login?: string } | null;
  repository_url: string;
  pull_request?: unknown;
}

interface GhSearchResponse {
  items?: GhSearchItem[];
}

interface GhNotification {
  reason: string;
  updated_at: string;
  subject: { title: string; url: string | null; type: string };
  repository: { full_name: string };
}

interface GhLogin {
  login?: string;
}

interface GhTimelineEvent {
  event?: string;
  created_at?: string;
  submitted_at?: string;
  actor?: GhLogin | null;
  user?: GhLogin | null;
  requested_reviewer?: GhLogin | null;
  assignee?: GhLogin | null;
  comments?: Array<{ created_at?: string; user?: GhLogin | null }>;
}

/**
 * La búsqueda y el buzón fechan el mismo cambio con segundos de diferencia; este
 * margen evita tomar por ajeno un hilo que en realidad es el mismo movimiento.
 */
const SAME_CHANGE_TOLERANCE_MS = 2 * 60 * 1000;

/** Acontecimientos de la línea de tiempo que mueven la PR y que hizo alguien. */
const UPDATE_EVENTS = new Set([
  'head_ref_force_pushed',
  'ready_for_review',
  'convert_to_draft',
  'closed',
  'reopened',
  'merged',
  'renamed',
]);

/**
 * El último acontecimiento atribuible de la línea de tiempo de una PR: quién y
 * qué supone para el usuario. Los `committed` no cuentan: traen el autor de git
 * (nombre y email), no la cuenta de GitHub, y no hay forma fiable de saber si
 * es el propio usuario.
 */
export function latestTimelineEvent(
  events: GhTimelineEvent[],
  me: string,
): { at: number; login: string; reason: IntegrationReason } | null {
  let best: { at: number; login: string; reason: IntegrationReason } | null = null;
  const consider = (date: string | undefined, who: GhLogin | null | undefined, reason: IntegrationReason) => {
    const at = Date.parse(date ?? '');
    const login = who?.login;
    if (!Number.isFinite(at) || !login) return;
    if (!best || at > best.at) best = { at, login, reason };
  };
  const isMe = (who: GhLogin | null | undefined) => who?.login?.toLowerCase() === me.toLowerCase();

  for (const e of events) {
    switch (e.event) {
      case 'commented':
        consider(e.created_at, e.user ?? e.actor, 'comment');
        break;
      case 'reviewed':
        consider(e.submitted_at, e.user, 'reviewed');
        break;
      case 'line-commented':
        for (const c of e.comments ?? []) consider(c.created_at, c.user, 'comment');
        break;
      case 'review_requested':
        consider(e.created_at, e.actor, isMe(e.requested_reviewer) ? 'review_requested' : 'updated');
        break;
      case 'assigned':
        consider(e.created_at, e.actor, isMe(e.assignee) ? 'assign' : 'updated');
        break;
      default:
        if (e.event && UPDATE_EVENTS.has(e.event)) consider(e.created_at, e.actor, 'updated');
    }
  }
  return best;
}

/** URL de la última página según la cabecera `Link`, solo si es de la API. */
function lastPageUrl(headers: Headers): string | null {
  const link = headers.get('link') ?? '';
  const match = /<([^>]+)>;\s*rel="last"/.exec(link);
  const url = match?.[1];
  return url && url.startsWith(`${API}/`) ? url : null;
}

function authHeaders(credential: ProviderCredential): Record<string, string> {
  return {
    Authorization: `Bearer ${credential.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': USER_AGENT,
  };
}

/** `https://api.github.com/repos/acme/web` -> `acme/web`. */
function repoFromUrl(repositoryUrl: string): string {
  const parts = repositoryUrl.split('/');
  const name = parts.pop() ?? '';
  const owner = parts.pop() ?? '';
  return owner && name ? `${owner}/${name}` : repositoryUrl;
}

function mapNotificationReason(reason: string): IntegrationReason {
  switch (reason) {
    case 'review_requested': return 'review_requested';
    case 'author':           return 'author';
    case 'assign':           return 'assign';
    case 'mention':
    case 'team_mention':     return 'mention';
    case 'comment':          return 'comment';
    case 'ci_activity':      return 'ci_activity';
    default:                 return 'involved';
  }
}

/** El buzón identifica la PR por su URL de API; basta el número para casar. */
function numberFromSubjectUrl(url: string | null): number | null {
  if (!url) return null;
  const last = url.split('/').pop();
  const n = last ? Number.parseInt(last, 10) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

export class GitHubProvider implements PrProvider {
  readonly id = 'github' as const;
  readonly supportsDeviceFlow = true;

  async startDeviceAuthorization(clientId: string): Promise<DeviceAuthorization> {
    const res = await fetchJson<{
      device_code?: string;
      user_code?: string;
      verification_uri?: string;
      interval?: number;
      expires_in?: number;
      error?: string;
      error_description?: string;
    }>(DEVICE_CODE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ client_id: clientId, scope: GITHUB_SCOPES }),
    });

    const body = res.body;
    if (!body || body.error || !body.device_code || !body.user_code) {
      // El fallo típico aquí es una OAuth App sin "Enable Device Flow" marcado.
      throw new ProviderAuthError(
        body?.error_description ?? 'GitHub no aceptó la petición de autorización',
      );
    }

    return {
      deviceCode: body.device_code,
      userCode: body.user_code,
      verificationUri: body.verification_uri ?? 'https://github.com/login/device',
      intervalSec: Math.max(5, body.interval ?? 5),
      expiresAt: Date.now() + (body.expires_in ?? 900) * 1000,
    };
  }

  async pollDeviceAuthorization(
    clientId: string,
    auth: DeviceAuthorization,
    signal: AbortSignal,
  ): Promise<string> {
    let waitMs = auth.intervalSec * 1000;

    while (!signal.aborted) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
      if (signal.aborted) break;
      if (Date.now() > auth.expiresAt) {
        throw new ProviderAuthError('El código ha caducado. Inténtalo otra vez.');
      }

      const res = await fetchJson<{
        access_token?: string;
        error?: string;
        error_description?: string;
        interval?: number;
      }>(ACCESS_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
        body: JSON.stringify({
          client_id: clientId,
          device_code: auth.deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });

      const body = res.body;
      if (body?.access_token) return body.access_token;

      switch (body?.error) {
        case 'authorization_pending':
          break;
        case 'slow_down':
          // GitHub pide espaciar: su `interval` manda sobre el nuestro.
          waitMs = Math.max(waitMs + 5000, (body.interval ?? 0) * 1000);
          break;
        case 'expired_token':
          throw new ProviderAuthError('El código ha caducado. Inténtalo otra vez.');
        case 'access_denied':
          throw new ProviderAuthError('Has cancelado la autorización en GitHub.');
        default:
          if (body?.error) {
            throw new ProviderAuthError(body.error_description ?? body.error);
          }
      }
    }

    throw new ProviderAuthError('Autorización cancelada', false);
  }

  async verify(credential: ProviderCredential): Promise<IntegrationAccount> {
    const res = await fetchJson<GhUser>(`${API}/user`, { headers: authHeaders(credential) });
    if (res.status === 401) throw new ProviderAuthError('El token no es válido o ha caducado.');
    if (res.status === 403) throw this.rateLimitOrAuth(res.headers);
    if (!res.body?.login) throw new ProviderAuthError('GitHub no devolvió la cuenta.');

    // Solo los tokens OAuth clásicos declaran scopes; un PAT fine-grained
    // devuelve la cabecera vacía y con él el buzón no es accesible.
    const scopes = (res.headers.get('x-oauth-scopes') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const hasInbox = scopes.includes('notifications') || scopes.includes('repo');

    return {
      provider: 'github',
      login: res.body.login,
      authMethod: credential.authMethod,
      hasInbox,
      connectedAt: Date.now(),
    };
  }

  async listRelevant(
    credential: ProviderCredential,
    account: IntegrationAccount,
  ): Promise<IntegrationItem[]> {
    const byId = new Map<string, IntegrationItem>();

    // La búsqueda es la fuente del conjunto: garantiza que solo se cuentan PRs
    // todavía abiertas, cosa que el buzón no distingue.
    const queries: Array<{ q: string; reason: IntegrationReason }> = [
      { q: 'is:open is:pr review-requested:@me archived:false', reason: 'review_requested' },
      { q: 'is:open is:pr involves:@me archived:false', reason: 'involved' },
    ];

    for (const { q, reason } of queries) {
      const url = `${API}/search/issues?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=50`;
      const res = await fetchJson<GhSearchResponse>(url, { headers: authHeaders(credential) });
      if (res.status === 401) throw new ProviderAuthError('El token no es válido o ha caducado.');
      if (res.status === 403) throw this.rateLimitOrAuth(res.headers);
      if (res.status !== 200 || !res.body?.items) continue;

      for (const item of res.body.items) {
        if (!item.pull_request) continue;
        const repo = repoFromUrl(item.repository_url);
        const id = `github:${repo}#${item.number}`;
        const mine = item.user?.login === account.login;
        const summary: IntegrationItem = {
          id,
          provider: 'github',
          kind: 'pull-request',
          repo,
          number: item.number,
          ref: `${repo}#${item.number}`,
          title: item.title,
          url: item.html_url,
          reason: mine ? 'author' : reason,
          updatedAt: Date.parse(item.updated_at) || Date.now(),
          isDraft: item.draft === true,
        };
        const previous = byId.get(id);
        // "Te han pedido revisión" pesa más que "te afecta" para el mismo hilo.
        if (!previous || (previous.reason === 'involved' && summary.reason !== 'involved')) {
          byId.set(id, summary);
        }
      }
    }

    if (account.hasInbox) await this.refineWithInbox(credential, byId);

    return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * El buzón no aporta PRs nuevas (puede traer cerradas), pero sí dice *qué*
   * ha pasado: sin él, un comentario nuevo y una mención se ven igual.
   */
  private async refineWithInbox(
    credential: ProviderCredential,
    byId: Map<string, IntegrationItem>,
  ): Promise<void> {
    const res = await fetchJson<GhNotification[]>(
      `${API}/notifications?all=false&per_page=50`,
      { headers: authHeaders(credential) },
    );
    if (res.status !== 200 || !Array.isArray(res.body)) return;

    for (const n of res.body) {
      if (n.subject?.type !== 'PullRequest') continue;
      const number = numberFromSubjectUrl(n.subject.url);
      if (number === null) continue;
      const entry = byId.get(`github:${n.repository.full_name}#${number}`);
      if (!entry) continue;
      const reason = mapNotificationReason(n.reason);
      if (entry.reason === 'involved' || reason === 'review_requested') {
        entry.reason = reason;
      }
    }
  }

  overviewUrl(): string {
    return 'https://github.com/pulls';
  }

  /**
   * La búsqueda actualiza la fecha de una PR sin decir quién la movió, así que
   * sin esto un comentario tuyo en tu propia PR te avisaba a ti mismo.
   *
   * Con buzón se le pregunta al buzón: GitHub no te notifica de tus propias
   * acciones, así que si el hilo de la PR no se ha movido a la vez que ella, el
   * cambio fue tuyo. Además el motivo que da es el bueno. Sin buzón (token
   * fine-grained) se lee la línea de tiempo de la PR.
   *
   * Una PR que aparece por primera vez sí avisa aunque la hayas abierto tú.
   */
  async explainChange(
    credential: ProviderCredential,
    account: IntegrationAccount,
    item: IntegrationItem,
    isNew: boolean,
  ): Promise<{ reason: IntegrationReason } | null> {
    if (isNew) return { reason: item.reason };
    return account.hasInbox
      ? this.explainFromInbox(credential, item)
      : this.explainFromTimeline(credential, account, item);
  }

  private async explainFromInbox(
    credential: ProviderCredential,
    item: IntegrationItem,
  ): Promise<{ reason: IntegrationReason } | null> {
    const since = new Date(item.updatedAt - SAME_CHANGE_TOLERANCE_MS).toISOString();
    const res = await fetchJson<GhNotification[]>(
      `${API}/notifications?all=true&since=${encodeURIComponent(since)}&per_page=50`,
      { headers: authHeaders(credential) },
    );
    if (res.status === 401) throw new ProviderAuthError('El token no es válido o ha caducado.');
    if (res.status === 403) throw this.rateLimitOrAuth(res.headers);
    if (res.status !== 200 || !Array.isArray(res.body)) return { reason: item.reason };

    const thread = res.body.find(
      (n) =>
        n.subject?.type === 'PullRequest' &&
        n.repository?.full_name === item.repo &&
        numberFromSubjectUrl(n.subject.url) === item.number,
    );
    // Sin hilo, o con un hilo anterior al cambio: nadie más ha hecho nada que
    // GitHub considere digno de avisarte, así que el movimiento fue tuyo.
    if (!thread) return null;
    if (Date.parse(thread.updated_at) < item.updatedAt - SAME_CHANGE_TOLERANCE_MS) return null;

    const reason = mapNotificationReason(thread.reason);
    return { reason: reason === 'involved' ? item.reason : reason };
  }

  private async explainFromTimeline(
    credential: ProviderCredential,
    account: IntegrationAccount,
    item: IntegrationItem,
  ): Promise<{ reason: IntegrationReason } | null> {
    const first = await fetchJson<GhTimelineEvent[]>(
      `${API}/repos/${item.repo}/issues/${item.number}/timeline?per_page=100`,
      { headers: authHeaders(credential) },
    );
    if (first.status === 401) throw new ProviderAuthError('El token no es válido o ha caducado.');
    // Un token fine-grained sin permiso de lectura sobre issues da 403 aquí: no
    // invalida la cuenta, simplemente no se puede saber quién fue.
    if (first.status !== 200 || !Array.isArray(first.body)) return { reason: item.reason };

    // La línea de tiempo va de más antiguo a más reciente: lo último está en la
    // última página.
    let events = first.body;
    const last = lastPageUrl(first.headers);
    if (last) {
      const page = await fetchJson<GhTimelineEvent[]>(last, { headers: authHeaders(credential) });
      if (page.status === 200 && Array.isArray(page.body)) events = page.body;
    }

    const latest = latestTimelineEvent(events, account.login);
    if (!latest) return { reason: item.reason };
    if (latest.login.toLowerCase() === account.login.toLowerCase()) return null;
    return { reason: latest.reason };
  }

  private rateLimitOrAuth(headers: Headers): Error {
    if (headers.get('x-ratelimit-remaining') === '0') {
      const reset = Number.parseInt(headers.get('x-ratelimit-reset') ?? '', 10);
      const retryAfterMs = Number.isFinite(reset)
        ? Math.max(0, reset * 1000 - Date.now())
        : 60_000;
      return new ProviderRateLimitError(retryAfterMs);
    }
    return new ProviderAuthError('GitHub ha rechazado la petición con el token actual.');
  }
}

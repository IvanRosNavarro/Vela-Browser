import type {
  IntegrationAccount,
  PullRequestReason,
  PullRequestSummary,
} from '@vela/shared';
import {
  ProviderAuthError,
  ProviderRateLimitError,
  type DeviceAuthorization,
  type PrProvider,
  type ProviderCredential,
} from '../types';
import { fetchJson } from './fetchJson';

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

function mapNotificationReason(reason: string): PullRequestReason {
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
  ): Promise<PullRequestSummary[]> {
    const byId = new Map<string, PullRequestSummary>();

    // La búsqueda es la fuente del conjunto: garantiza que solo se cuentan PRs
    // todavía abiertas, cosa que el buzón no distingue.
    const queries: Array<{ q: string; reason: PullRequestReason }> = [
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
        const summary: PullRequestSummary = {
          id,
          provider: 'github',
          repo,
          number: item.number,
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
    byId: Map<string, PullRequestSummary>,
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

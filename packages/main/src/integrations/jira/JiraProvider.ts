import type { IntegrationAccount, IntegrationItem, IntegrationReason } from '@vela/shared';
import { fetchJson } from '../fetchJson';
import { basicAuthHeaders, jiraGatewayBase, rateLimitFrom } from '../atlassian/common';
import {
  ProviderAuthError,
  type DeviceAuthorization,
  type PrProvider,
  type ProviderCredential,
} from '../types';

/**
 * Lo tuyo: asignado a ti, reportado por ti o que vigilas. La ventana de 14 días
 * acota la respuesta; lo que no se ha movido en ese tiempo no va a avisar.
 */
export const JIRA_JQL =
  '(assignee = currentUser() OR reporter = currentUser() OR watcher = currentUser()) ' +
  'AND updated >= -14d ORDER BY updated DESC';

const MAX_RESULTS = 50;

interface JiraUserRef {
  accountId?: string;
}

interface JiraMyself {
  accountId?: string;
  displayName?: string;
}

interface JiraSearchResponse {
  issues?: Array<{
    key: string;
    fields?: {
      summary?: string;
      updated?: string;
      assignee?: JiraUserRef | null;
    };
  }>;
}

interface JiraIssueResponse {
  fields?: {
    created?: string;
    creator?: JiraUserRef | null;
    assignee?: JiraUserRef | null;
  };
}

interface JiraComment {
  created?: string;
  author?: JiraUserRef;
  /** ADF: las menciones son nodos `mention` con `attrs.id` = accountId. */
  body?: unknown;
}

interface JiraHistory {
  created?: string;
  author?: JiraUserRef;
  items?: Array<{ field?: string; to?: string | null }>;
}

interface JiraPage<T> {
  values?: T[];
  comments?: T[];
  total?: number;
}

/** Un acontecimiento del issue: quién, cuándo y qué supone para el usuario. */
interface JiraEvent {
  at: number;
  actor: string | undefined;
  reason: IntegrationReason;
}

export class JiraProvider implements PrProvider {
  readonly id = 'jira' as const;
  readonly supportsDeviceFlow = false;

  constructor(private readonly now: () => number = Date.now) {}

  startDeviceAuthorization(): Promise<DeviceAuthorization> {
    return Promise.reject(new ProviderAuthError('Jira se conecta con un API token.', false));
  }

  pollDeviceAuthorization(): Promise<string> {
    return Promise.reject(new ProviderAuthError('Jira se conecta con un API token.', false));
  }

  /**
   * Atlassian tiene dos clases de API token. Los clásicos funcionan contra el
   * propio sitio; los que llevan scopes dan 401 ahí y solo se aceptan por la
   * pasarela `api.atlassian.com/ex/jira/{cloudId}`. Se prueba el sitio y, si lo
   * rechaza, la pasarela: el usuario no tiene por qué saber qué token creó.
   */
  async verify(credential: ProviderCredential): Promise<IntegrationAccount> {
    const site = credential.site;
    if (!site) throw new ProviderAuthError('Falta el sitio de Jira.', false);

    const siteBase = `https://${site}`;
    let apiBase = siteBase;
    let res = await fetchJson<JiraMyself>(`${siteBase}/rest/api/3/myself`, {
      headers: basicAuthHeaders(credential),
    });

    if (res.status === 401) {
      apiBase = jiraGatewayBase(await this.cloudIdFor(site));
      res = await fetchJson<JiraMyself>(`${apiBase}/rest/api/3/myself`, {
        headers: basicAuthHeaders(credential),
      });
    }

    if (res.status === 401 || res.status === 403) {
      throw new ProviderAuthError('Jira ha rechazado el token: comprueba el sitio, el email y el token.');
    }
    if (res.status === 429) throw rateLimitFrom(res.headers);
    if (res.status === 404) {
      throw new ProviderAuthError(`No hay ningún Jira en ${site}.`, false);
    }
    if (res.status !== 200 || !res.body?.accountId) {
      throw new ProviderAuthError('Jira no devolvió la cuenta.');
    }

    return {
      provider: 'jira',
      login: res.body.displayName ?? 'Jira',
      authMethod: 'token',
      hasInbox: false,
      connectedAt: this.now(),
      accountId: res.body.accountId,
      site,
      apiBase,
    };
  }

  async listRelevant(
    credential: ProviderCredential,
    account: IntegrationAccount,
  ): Promise<IntegrationItem[]> {
    const { apiBase, site } = this.endpoints(account);
    const res = await fetchJson<JiraSearchResponse>(`${apiBase}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { ...basicAuthHeaders(credential), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jql: JIRA_JQL,
        fields: ['summary', 'updated', 'assignee'],
        maxResults: MAX_RESULTS,
      }),
    });
    this.check(res.status, res.headers);

    const items: IntegrationItem[] = [];
    for (const issue of res.body?.issues ?? []) {
      const [project, num] = splitKey(issue.key);
      if (!project) continue;
      items.push({
        id: `jira:${site}:${issue.key}`,
        provider: 'jira',
        kind: 'issue',
        repo: project,
        number: num,
        ref: issue.key,
        title: issue.fields?.summary ?? issue.key,
        url: `https://${site}/browse/${issue.key}`,
        reason: issue.fields?.assignee?.accountId === account.accountId ? 'assign' : 'involved',
        updatedAt: Date.parse(issue.fields?.updated ?? '') || this.now(),
        isDraft: false,
      });
    }
    return items;
  }

  overviewUrl(account: IntegrationAccount): string {
    return `https://${account.site ?? 'id.atlassian.com'}/jira/your-work`;
  }

  /**
   * El último acontecimiento del issue entre su creación, su último comentario y
   * la última entrada del historial. Si lo hizo el propio usuario, no hay aviso:
   * moverte tus propios tickets no es noticia para ti. Aquí da igual que el
   * issue sea nuevo o no; uno que aparece porque acabas de comentarlo también lo
   * has tocado tú.
   */
  async explainChange(
    credential: ProviderCredential,
    account: IntegrationAccount,
    item: IntegrationItem,
  ): Promise<{ reason: IntegrationReason } | null> {
    const { apiBase } = this.endpoints(account);
    const me = account.accountId;
    const headers = basicAuthHeaders(credential);
    const key = encodeURIComponent(item.ref);
    const events: JiraEvent[] = [];

    const issue = await fetchJson<JiraIssueResponse>(
      `${apiBase}/rest/api/3/issue/${key}?fields=created,creator,assignee`,
      { headers },
    );
    this.check(issue.status, issue.headers);
    const assignedToMe = issue.body?.fields?.assignee?.accountId === me;
    const created = Date.parse(issue.body?.fields?.created ?? '');
    if (Number.isFinite(created)) {
      events.push({
        at: created,
        actor: issue.body?.fields?.creator?.accountId,
        reason: assignedToMe ? 'assign' : 'updated',
      });
    }

    const comments = await fetchJson<JiraPage<JiraComment>>(
      `${apiBase}/rest/api/3/issue/${key}/comment?orderBy=-created&maxResults=1`,
      { headers },
    );
    this.check(comments.status, comments.headers);
    const comment = comments.body?.comments?.[0];
    if (comment) {
      const at = Date.parse(comment.created ?? '');
      if (Number.isFinite(at)) {
        events.push({
          at,
          actor: comment.author?.accountId,
          reason: me && mentions(comment.body, me) ? 'mention' : 'comment',
        });
      }
    }

    const history = await this.latestHistory(apiBase, key, headers);
    if (history) {
      const at = Date.parse(history.created ?? '');
      if (Number.isFinite(at)) {
        const assignment = (history.items ?? []).some(
          (change) => change.field === 'assignee' && change.to === me,
        );
        events.push({
          at,
          actor: history.author?.accountId,
          reason: assignment ? 'assign' : 'updated',
        });
      }
    }

    const latest = events.sort((a, b) => b.at - a.at)[0];
    if (!latest) return { reason: item.reason };
    if (latest.actor && latest.actor === me) return null;
    return { reason: latest.reason };
  }

  /**
   * El historial va de más antiguo a más reciente y pagina: para la última
   * entrada hay que saber el total y pedir el final.
   */
  private async latestHistory(
    apiBase: string,
    key: string,
    headers: Record<string, string>,
  ): Promise<JiraHistory | null> {
    const first = await fetchJson<JiraPage<JiraHistory>>(
      `${apiBase}/rest/api/3/issue/${key}/changelog?maxResults=5`,
      { headers },
    );
    this.check(first.status, first.headers);
    const total = first.body?.total ?? 0;
    let values = first.body?.values ?? [];

    if (total > values.length) {
      const last = await fetchJson<JiraPage<JiraHistory>>(
        `${apiBase}/rest/api/3/issue/${key}/changelog?startAt=${Math.max(0, total - 5)}&maxResults=5`,
        { headers },
      );
      this.check(last.status, last.headers);
      values = last.body?.values ?? values;
    }

    return (
      [...values].sort(
        (a, b) => (Date.parse(b.created ?? '') || 0) - (Date.parse(a.created ?? '') || 0),
      )[0] ?? null
    );
  }

  private endpoints(account: IntegrationAccount): { apiBase: string; site: string } {
    if (!account.site || !account.apiBase) {
      throw new ProviderAuthError('Falta el sitio de Jira: vuelve a conectar la cuenta.');
    }
    return { apiBase: account.apiBase, site: account.site };
  }

  private check(status: number, headers: Headers): void {
    if (status === 401) throw new ProviderAuthError('Jira ha rechazado el token.');
    if (status === 429) throw rateLimitFrom(headers);
    if (status !== 200) throw new Error(`Jira respondió ${status}`);
  }

  /**
   * El cloudId de un sitio se publica sin autenticación en `/_edge/tenant_info`.
   * El host ya llega validado como de Atlassian.
   */
  private async cloudIdFor(site: string): Promise<string> {
    const res = await fetchJson<{ cloudId?: string }>(`https://${site}/_edge/tenant_info`, {});
    if (res.status !== 200 || !res.body?.cloudId) {
      throw new ProviderAuthError(`No se pudo identificar el sitio ${site}.`, false);
    }
    return res.body.cloudId;
  }
}

/** `WEB-123` → `['WEB', 123]`. */
export function splitKey(key: string): [string, number] {
  const match = /^([A-Z][A-Z0-9_]*)-(\d+)$/.exec(key);
  if (!match) return ['', 0];
  return [match[1]!, Number.parseInt(match[2]!, 10)];
}

/** ¿Menciona este cuerpo ADF a la cuenta? Las menciones llevan su accountId. */
export function mentions(body: unknown, accountId: string): boolean {
  if (!body || typeof body !== 'object') return false;
  const node = body as { type?: unknown; attrs?: { id?: unknown }; content?: unknown };
  if (node.type === 'mention' && node.attrs?.id === accountId) return true;
  return Array.isArray(node.content) && node.content.some((child) => mentions(child, accountId));
}

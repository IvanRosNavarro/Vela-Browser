import type { IntegrationAccount, IntegrationItem, IntegrationReason } from '@vela/shared';
import { fetchJson } from '../fetchJson';
import { basicAuthHeaders, rateLimitFrom } from '../atlassian/common';
import {
  ProviderAuthError,
  type DeviceAuthorization,
  type ListContext,
  type PrProvider,
  type ProviderCredential,
} from '../types';

const API = 'https://api.bitbucket.org/2.0';

/** Los cuatro scopes que necesita el API token; la interfaz los enseña tal cual. */
export const BITBUCKET_SCOPES = [
  'read:user:bitbucket',
  'read:workspace:bitbucket',
  'read:repository:bitbucket',
  'read:pullrequest:bitbucket',
] as const;

/**
 * Bitbucket no tiene un endpoint que liste entre workspaces las PRs donde eres
 * revisor (el que había se retiró en febrero de 2025), así que hay que recorrer
 * repos. Para no fundir el límite de 1000 peticiones por hora se mira lo que ha
 * tenido actividad reciente más los repos donde ya hay algo para ti (ver
 * `tracked`), con topes, y se sondea más espaciado.
 */
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const WORKSPACES_TTL_MS = 60 * 60 * 1000;
const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_WORKSPACES = 10;
const MAX_REVIEW_REPOS = 25;

interface BbUser {
  uuid?: string;
  display_name?: string;
  nickname?: string;
}

interface BbPage<T> {
  values?: T[];
}

interface BbWorkspaceAccess {
  workspace?: { slug?: string };
  slug?: string;
}

interface BbRepo {
  full_name?: string;
  updated_on?: string;
}

interface BbPr {
  id: number;
  title: string;
  updated_on: string;
  draft?: boolean;
  author?: { uuid?: string } | null;
  links?: { html?: { href?: string } };
  destination?: { repository?: { full_name?: string } };
}

interface BbActor {
  uuid?: string;
}

interface BbActivity {
  update?: { date?: string; author?: BbActor };
  comment?: { created_on?: string; user?: BbActor };
  approval?: { date?: string; user?: BbActor };
  changes_requested?: { date?: string; user?: BbActor };
}

export class BitbucketProvider implements PrProvider {
  readonly id = 'bitbucket' as const;
  readonly supportsDeviceFlow = false;
  readonly pollIntervalMs = POLL_INTERVAL_MS;

  /** Workspaces por usuario: cambian rara vez y no merece pedirlos en cada ronda. */
  private readonly workspaces = new Map<string, { at: number; slugs: string[] }>();

  /**
   * Repos «seguidos» por usuario: donde ya apareció una PR que te toca revisar.
   * Se siguen consultando aunque salgan de la ventana de actividad —una PR
   * abierta hace semanas en un repo sin pushes nuevos sigue esperándote— y
   * salen en cuanto la consulta no devuelve nada.
   */
  private readonly tracked = new Map<string, Set<string>>();
  /** Usuarios cuyo conjunto ya se sembró con los ids guardados en esta sesión. */
  private readonly seeded = new Set<string>();

  constructor(private readonly now: () => number = Date.now) {}

  startDeviceAuthorization(): Promise<DeviceAuthorization> {
    return Promise.reject(new ProviderAuthError('Bitbucket se conecta con un API token.', false));
  }

  pollDeviceAuthorization(): Promise<string> {
    return Promise.reject(new ProviderAuthError('Bitbucket se conecta con un API token.', false));
  }

  async verify(credential: ProviderCredential): Promise<IntegrationAccount> {
    const user = await this.get<BbUser>(`${API}/user`, credential, { allowMissing: false });
    if (!user?.uuid) throw new ProviderAuthError('Bitbucket no devolvió la cuenta.');
    return {
      provider: 'bitbucket',
      login: user.display_name ?? user.nickname ?? 'Bitbucket',
      authMethod: 'token',
      hasInbox: false,
      connectedAt: this.now(),
      accountId: user.uuid,
    };
  }

  async listRelevant(
    credential: ProviderCredential,
    account: IntegrationAccount,
    context?: ListContext,
  ): Promise<IntegrationItem[]> {
    const me = account.accountId;
    if (!me) throw new ProviderAuthError('Falta el identificador de la cuenta de Bitbucket.');

    const tracked = this.trackedFor(me, context?.knownIds ?? []);
    const byId = new Map<string, IntegrationItem>();
    const workspaces = await this.workspacesFor(credential, me);
    const user = encodeURIComponent(me);

    // Las tuyas: un endpoint por workspace.
    for (const ws of workspaces) {
      const page = await this.get<BbPage<BbPr>>(
        `${API}/workspaces/${encodeURIComponent(ws)}/pullrequests/${user}?state=OPEN&pagelen=50`,
        credential,
      );
      for (const pr of page?.values ?? []) this.add(byId, pr, 'author', me);
    }

    // Las que te toca revisar: en los repos seguidos y en los que han tenido
    // actividad reciente.
    const active: Array<{ fullName: string; updatedAt: number }> = [];
    const since = this.now() - ACTIVE_WINDOW_MS;
    for (const ws of workspaces) {
      const page = await this.get<BbPage<BbRepo>>(
        `${API}/repositories/${encodeURIComponent(ws)}?role=member&sort=-updated_on&pagelen=20`,
        credential,
      );
      for (const repo of page?.values ?? []) {
        const updatedAt = Date.parse(repo.updated_on ?? '');
        if (repo.full_name && updatedAt >= since) {
          active.push({ fullName: repo.full_name, updatedAt });
        }
      }
    }
    active.sort((a, b) => b.updatedAt - a.updatedAt);

    // Los seguidos van primero: ahí se sabe que hay algo esperándote.
    const repos = [
      ...tracked,
      ...active.map((r) => r.fullName).filter((name) => !tracked.has(name)),
    ].slice(0, MAX_REVIEW_REPOS);

    const reviewerQuery = encodeURIComponent(`reviewers.uuid="${me}" AND state="OPEN"`);
    for (const repo of repos) {
      const page = await this.get<BbPage<BbPr>>(
        `${API}/repositories/${repo}/pullrequests?pagelen=50&q=${reviewerQuery}`,
        credential,
      );
      const found = page?.values ?? [];
      for (const pr of found) this.add(byId, pr, 'review_requested', me);
      if (found.length > 0) tracked.add(repo);
      else tracked.delete(repo);
    }

    return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  overviewUrl(): string {
    return 'https://bitbucket.org/dashboard/overview';
  }

  async explainChange(
    credential: ProviderCredential,
    account: IntegrationAccount,
    item: IntegrationItem,
    isNew: boolean,
  ): Promise<{ reason: IntegrationReason } | null> {
    // Que aparezca una PR —también una tuya recién abierta— ya es noticia, igual
    // que en GitHub. Lo que se filtra son las actualizaciones hechas por ti.
    if (isNew) return { reason: item.reason };

    const page = await this.get<BbPage<BbActivity>>(
      `${API}/repositories/${item.repo}/pullrequests/${item.number}/activity?pagelen=20`,
      credential,
    );
    const latest = latestActivity(page?.values ?? []);
    if (!latest) return { reason: item.reason };
    if (latest.actor && latest.actor === account.accountId) return null;
    return { reason: latest.reason };
  }

  private add(
    byId: Map<string, IntegrationItem>,
    pr: BbPr,
    reason: IntegrationReason,
    me: string,
  ): void {
    const repo = pr.destination?.repository?.full_name;
    const url = pr.links?.html?.href;
    if (!repo || !url) return;

    const id = `bitbucket:${repo}#${pr.id}`;
    const previous = byId.get(id);
    // "Te han pedido revisión" pesa más que "es tuya" si coinciden.
    if (previous && previous.reason === 'review_requested') return;

    byId.set(id, {
      id,
      provider: 'bitbucket',
      kind: 'pull-request',
      repo,
      number: pr.id,
      ref: `${repo}#${pr.id}`,
      title: pr.title,
      url,
      reason: pr.author?.uuid === me && reason !== 'review_requested' ? 'author' : reason,
      updatedAt: Date.parse(pr.updated_on) || this.now(),
      isDraft: pr.draft === true,
    });
  }

  /**
   * El conjunto de repos seguidos del usuario. Vive en memoria, así que la
   * primera vez en cada sesión se siembra con los repos de los ids ya vistos
   * (que el servicio guarda en el perfil): sin eso, tras reiniciar Vela, una PR
   * en un repo sin actividad desaparecería hasta que alguien hiciera un push.
   * Los que no tengan nada se caen en la primera ronda.
   */
  private trackedFor(me: string, knownIds: readonly string[]): Set<string> {
    let set = this.tracked.get(me);
    if (!set) {
      set = new Set();
      this.tracked.set(me, set);
    }
    if (!this.seeded.has(me)) {
      this.seeded.add(me);
      for (const id of knownIds) {
        const repo = repoFromItemId(id);
        if (repo) set.add(repo);
      }
    }
    return set;
  }

  private async workspacesFor(credential: ProviderCredential, me: string): Promise<string[]> {
    const cached = this.workspaces.get(me);
    if (cached && this.now() - cached.at < WORKSPACES_TTL_MS) return cached.slugs;

    const page = await this.get<BbPage<BbWorkspaceAccess>>(
      `${API}/user/workspaces?pagelen=100`,
      credential,
      { allowMissing: false },
    );
    const slugs = (page?.values ?? [])
      .map((v) => v.workspace?.slug ?? v.slug)
      .filter((slug): slug is string => typeof slug === 'string' && slug.length > 0)
      .slice(0, MAX_WORKSPACES);

    this.workspaces.set(me, { at: this.now(), slugs });
    return slugs;
  }

  /**
   * GET contra la API. Un 403 o 404 en un workspace o repo concreto no invalida
   * la cuenta —puede ser un repo sin permiso—, así que por defecto se salta;
   * en la verificación de la cuenta, en cambio, sí es fatal.
   */
  private async get<T>(
    url: string,
    credential: ProviderCredential,
    opts: { allowMissing?: boolean } = {},
  ): Promise<T | null> {
    const allowMissing = opts.allowMissing ?? true;
    const res = await fetchJson<T>(url, { headers: basicAuthHeaders(credential) });

    if (res.status === 401) {
      throw new ProviderAuthError('Bitbucket ha rechazado el token: comprueba el email y el token.');
    }
    if (res.status === 429) throw rateLimitFrom(res.headers);
    if (res.status === 403 || res.status === 404) {
      if (allowMissing) return null;
      throw new ProviderAuthError(
        `Al token le falta algún permiso. Necesita: ${BITBUCKET_SCOPES.join(', ')}.`,
      );
    }
    if (res.status !== 200) {
      throw new Error(`Bitbucket respondió ${res.status}`);
    }
    return res.body;
  }
}

/** Un repo de Bitbucket es `workspace/slug`, ambos con caracteres de URL seguros. */
const REPO_NAME = /^[\w.-]+\/[\w.-]+$/;

/**
 * `bitbucket:acme/web#7` → `acme/web`. El id sale del perfil y el nombre acaba
 * en una URL de la API, así que solo se acepta con forma de repo.
 */
export function repoFromItemId(id: string): string | null {
  if (!id.startsWith('bitbucket:')) return null;
  const hash = id.lastIndexOf('#');
  if (hash < 0) return null;
  const repo = id.slice('bitbucket:'.length, hash);
  if (!REPO_NAME.test(repo)) return null;
  // `.` y `..` encajan en la expresión pero recolocarían la ruta de la API.
  return repo.split('/').some((segment) => /^\.+$/.test(segment)) ? null : repo;
}

/** La entrada más reciente del historial de actividad, con su autor y su tipo. */
export function latestActivity(
  values: BbActivity[],
): { at: number; actor: string | undefined; reason: IntegrationReason } | null {
  let best: { at: number; actor: string | undefined; reason: IntegrationReason } | null = null;
  const consider = (date: string | undefined, actor: BbActor | undefined, reason: IntegrationReason) => {
    const at = Date.parse(date ?? '');
    if (!Number.isFinite(at)) return;
    if (!best || at > best.at) best = { at, actor: actor?.uuid, reason };
  };

  for (const v of values) {
    if (v.comment) consider(v.comment.created_on, v.comment.user, 'comment');
    if (v.approval) consider(v.approval.date, v.approval.user, 'reviewed');
    if (v.changes_requested) consider(v.changes_requested.date, v.changes_requested.user, 'reviewed');
    if (v.update) consider(v.update.date, v.update.author, 'updated');
  }
  return best;
}

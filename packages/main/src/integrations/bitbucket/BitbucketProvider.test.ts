import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntegrationAccount } from '@vela/shared';

const fetchMock = vi.fn();

vi.mock('electron', () => ({
  net: { fetch: (...args: unknown[]) => fetchMock(...args) },
}));

const { BitbucketProvider, latestActivity, repoFromItemId } = await import('./BitbucketProvider');
const { ProviderAuthError, ProviderRateLimitError } = await import('../types');

const ME = '{11111111-aaaa-bbbb-cccc-000000000001}';
const OTHER = '{22222222-aaaa-bbbb-cccc-000000000002}';
const NOW = Date.parse('2026-10-01T12:00:00Z');

const credential = { token: 'tok', email: 'yo@acme.com', authMethod: 'token' as const };
const account: IntegrationAccount = {
  provider: 'bitbucket',
  login: 'Iván',
  authMethod: 'token',
  hasInbox: false,
  connectedAt: 0,
  accountId: ME,
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    status,
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    text: async () => JSON.stringify(body),
  };
}

function pr(id: number, repo: string, author: string, updated = '2026-09-30T10:00:00Z') {
  return {
    id,
    title: `PR ${id}`,
    updated_on: updated,
    author: { uuid: author },
    links: { html: { href: `https://bitbucket.org/${repo}/pull-requests/${id}` } },
    destination: { repository: { full_name: repo } },
  };
}

/** Responde según la ruta pedida; lo no previsto da 404. */
function routes(map: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: string) => {
    for (const [fragment, body] of Object.entries(map)) {
      if (url.includes(fragment)) return typeof body === 'function' ? body() : json(body);
    }
    return json({}, 404);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('BitbucketProvider.verify', () => {
  it('usa el uuid como identificador de la cuenta', async () => {
    routes({ '/2.0/user': { uuid: ME, display_name: 'Iván' } });

    const result = await new BitbucketProvider(() => NOW).verify(credential);

    expect(result).toMatchObject({ login: 'Iván', accountId: ME, hasInbox: false });
  });

  it('un 403 al verificar es un token sin los permisos necesarios', async () => {
    routes({ '/2.0/user': () => json({}, 403) });

    await expect(new BitbucketProvider(() => NOW).verify(credential)).rejects.toThrow(
      /read:pullrequest:bitbucket/,
    );
  });

  it('un 401 es credencial rechazada', async () => {
    routes({ '/2.0/user': () => json({}, 401) });

    await expect(new BitbucketProvider(() => NOW).verify(credential)).rejects.toBeInstanceOf(
      ProviderAuthError,
    );
  });
});

describe('BitbucketProvider.listRelevant', () => {
  it('junta las tuyas y las que te toca revisar', async () => {
    routes({
      '/user/workspaces': { values: [{ workspace: { slug: 'acme' } }] },
      '/workspaces/acme/pullrequests/': { values: [pr(1, 'acme/web', ME)] },
      '/repositories/acme?role=member': {
        values: [{ full_name: 'acme/api', updated_on: '2026-09-29T00:00:00Z' }],
      },
      '/repositories/acme/api/pullrequests': { values: [pr(2, 'acme/api', OTHER)] },
    });

    const items = await new BitbucketProvider(() => NOW).listRelevant(credential, account);

    expect(items.map((i) => [i.ref, i.reason, i.kind])).toEqual(
      expect.arrayContaining([
        ['acme/web#1', 'author', 'pull-request'],
        ['acme/api#2', 'review_requested', 'pull-request'],
      ]),
    );
  });

  it('no recorre repos sin actividad reciente', async () => {
    routes({
      '/user/workspaces': { values: [{ workspace: { slug: 'acme' } }] },
      '/workspaces/acme/pullrequests/': { values: [] },
      '/repositories/acme?role=member': {
        values: [{ full_name: 'acme/viejo', updated_on: '2025-01-01T00:00:00Z' }],
      },
    });

    await new BitbucketProvider(() => NOW).listRelevant(credential, account);

    const asked = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(asked.some((u) => u.includes('acme/viejo/pullrequests'))).toBe(false);
  });

  it('un repo sin permiso no tumba el sondeo entero', async () => {
    routes({
      '/user/workspaces': { values: [{ workspace: { slug: 'acme' } }] },
      '/workspaces/acme/pullrequests/': { values: [pr(1, 'acme/web', ME)] },
      '/repositories/acme?role=member': {
        values: [{ full_name: 'acme/secreto', updated_on: '2026-09-30T00:00:00Z' }],
      },
      '/repositories/acme/secreto/pullrequests': () => json({}, 403),
    });

    const items = await new BitbucketProvider(() => NOW).listRelevant(credential, account);

    expect(items).toHaveLength(1);
  });

  it('el límite de peticiones se propaga con su espera', async () => {
    routes({ '/user/workspaces': () => json({}, 429, { 'retry-after': '120' }) });

    const err = await new BitbucketProvider(() => NOW)
      .listRelevant(credential, account)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ProviderRateLimitError);
    expect((err as InstanceType<typeof ProviderRateLimitError>).retryAfterMs).toBe(120_000);
  });

  it('pide los workspaces una vez por hora, no en cada ronda', async () => {
    routes({
      '/user/workspaces': { values: [{ workspace: { slug: 'acme' } }] },
      '/workspaces/acme/pullrequests/': { values: [] },
      '/repositories/acme?role=member': { values: [] },
    });
    const provider = new BitbucketProvider(() => NOW);

    await provider.listRelevant(credential, account);
    await provider.listRelevant(credential, account);

    const asked = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(asked.filter((u) => u.includes('/user/workspaces'))).toHaveLength(1);
  });
});

describe('BitbucketProvider.explainChange', () => {
  const item = {
    id: 'bitbucket:acme/web#1',
    provider: 'bitbucket' as const,
    kind: 'pull-request' as const,
    repo: 'acme/web',
    number: 1,
    ref: 'acme/web#1',
    title: 'PR 1',
    url: 'https://bitbucket.org/acme/web/pull-requests/1',
    reason: 'author' as const,
    updatedAt: NOW,
    isDraft: false,
  };

  it('una PR nueva es noticia aunque la hayas abierto tú', async () => {
    const result = await new BitbucketProvider(() => NOW).explainChange(
      credential,
      account,
      item,
      true,
    );

    expect(result).toEqual({ reason: 'author' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no avisa de un comentario tuyo', async () => {
    routes({
      '/activity': {
        values: [{ comment: { created_on: '2026-09-30T11:00:00Z', user: { uuid: ME } } }],
      },
    });

    const result = await new BitbucketProvider(() => NOW).explainChange(
      credential,
      account,
      item,
      false,
    );

    expect(result).toBeNull();
  });

  it('una aprobación de otra persona es una revisión nueva', async () => {
    routes({
      '/activity': {
        values: [
          { comment: { created_on: '2026-09-30T09:00:00Z', user: { uuid: ME } } },
          { approval: { date: '2026-09-30T11:00:00Z', user: { uuid: OTHER } } },
        ],
      },
    });

    const result = await new BitbucketProvider(() => NOW).explainChange(
      credential,
      account,
      item,
      false,
    );

    expect(result).toEqual({ reason: 'reviewed' });
  });
});

describe('latestActivity', () => {
  it('elige la más reciente aunque venga desordenada', () => {
    const latest = latestActivity([
      { update: { date: '2026-09-30T08:00:00Z', author: { uuid: ME } } },
      { comment: { created_on: '2026-09-30T12:00:00Z', user: { uuid: OTHER } } },
      { approval: { date: '2026-09-30T10:00:00Z', user: { uuid: OTHER } } },
    ]);

    expect(latest).toMatchObject({ actor: OTHER, reason: 'comment' });
  });

  it('sin actividad no hay nada que explicar', () => {
    expect(latestActivity([])).toBeNull();
  });
});

describe('BitbucketProvider — repos seguidos', () => {
  /** Workspace `acme` sin ningún repo dentro de la ventana de actividad. */
  const staleWorkspace = {
    '/user/workspaces': { values: [{ workspace: { slug: 'acme' } }] },
    '/workspaces/acme/pullrequests/': { values: [] },
    '/repositories/acme?role=member': {
      values: [{ full_name: 'acme/viejo', updated_on: '2025-01-01T00:00:00Z' }],
    },
  };

  const asked = () => fetchMock.mock.calls.map((c) => String(c[0]));

  it('tras reiniciar sigue vigilando un repo sin actividad donde ya había una PR', async () => {
    routes({
      ...staleWorkspace,
      '/repositories/acme/viejo/pullrequests': { values: [pr(4, 'acme/viejo', OTHER)] },
    });

    const items = await new BitbucketProvider(() => NOW).listRelevant(credential, account, {
      knownIds: ['bitbucket:acme/viejo#4'],
    });

    expect(items.map((i) => i.ref)).toEqual(['acme/viejo#4']);
  });

  it('un repo donde se encontró una PR se sigue aunque deje de estar activo', async () => {
    const provider = new BitbucketProvider(() => NOW);
    routes({
      '/user/workspaces': { values: [{ workspace: { slug: 'acme' } }] },
      '/workspaces/acme/pullrequests/': { values: [] },
      '/repositories/acme?role=member': {
        values: [{ full_name: 'acme/api', updated_on: '2026-09-29T00:00:00Z' }],
      },
      '/repositories/acme/api/pullrequests': { values: [pr(2, 'acme/api', OTHER)] },
    });
    await provider.listRelevant(credential, account);

    // Una ronda después el repo ya no sale entre los activos.
    fetchMock.mockReset();
    routes({
      '/workspaces/acme/pullrequests/': { values: [] },
      '/repositories/acme?role=member': { values: [] },
      '/repositories/acme/api/pullrequests': { values: [pr(2, 'acme/api', OTHER)] },
    });
    const items = await provider.listRelevant(credential, account);

    expect(items.map((i) => i.ref)).toEqual(['acme/api#2']);
  });

  it('deja de seguir un repo en cuanto no tiene nada para ti', async () => {
    const provider = new BitbucketProvider(() => NOW);
    routes({ ...staleWorkspace, '/repositories/acme/viejo/pullrequests': { values: [] } });

    await provider.listRelevant(credential, account, { knownIds: ['bitbucket:acme/viejo#4'] });
    fetchMock.mockClear();
    await provider.listRelevant(credential, account, { knownIds: ['bitbucket:acme/viejo#4'] });

    // La siembra es una vez por sesión: no vuelve a meterlo.
    expect(asked().some((u) => u.includes('acme/viejo/pullrequests'))).toBe(false);
  });
});

describe('repoFromItemId', () => {
  it('saca el repo del id', () => {
    expect(repoFromItemId('bitbucket:acme/web#7')).toBe('acme/web');
    expect(repoFromItemId('bitbucket:acme/mi.repo-2#12')).toBe('acme/mi.repo-2');
  });

  // El nombre acaba en una URL de la API: nada que no tenga forma de repo.
  it.each([
    ['github:acme/web#7'],
    ['bitbucket:acme/web'],
    ['bitbucket:../../user#1'],
    ['bitbucket:../x#1'],
    ['bitbucket:acme/..#1'],
    ['bitbucket:acme/web/../x#1'],
    ['bitbucket:acme/web?q=1#1'],
  ])('rechaza %s', (id) => {
    expect(repoFromItemId(id)).toBeNull();
  });
});

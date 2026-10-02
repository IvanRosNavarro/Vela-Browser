import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IntegrationAccount, IntegrationItem } from '@vela/shared';

const fetchMock = vi.fn();

vi.mock('electron', () => ({
  net: { fetch: (...args: unknown[]) => fetchMock(...args) },
}));

const { JiraProvider, mentions, splitKey } = await import('./JiraProvider');
const { ProviderAuthError } = await import('../types');

const ME = '5b10ac8d82e05b22cc7d4ef5';
const OTHER = '712020:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CLOUD_ID = '11111111-2222-3333-4444-555555555555';
const GATEWAY = `https://api.atlassian.com/ex/jira/${CLOUD_ID}`;

const credential = {
  token: 'tok',
  email: 'yo@acme.com',
  site: 'acme.atlassian.net',
  authMethod: 'token' as const,
};

const account: IntegrationAccount = {
  provider: 'jira',
  login: 'Iván',
  authMethod: 'token',
  hasInbox: false,
  connectedAt: 0,
  accountId: ME,
  site: 'acme.atlassian.net',
  apiBase: 'https://acme.atlassian.net',
};

const item: IntegrationItem = {
  id: 'jira:acme.atlassian.net:WEB-12',
  provider: 'jira',
  kind: 'issue',
  repo: 'WEB',
  number: 12,
  ref: 'WEB-12',
  title: 'Arreglar el login',
  url: 'https://acme.atlassian.net/browse/WEB-12',
  reason: 'assign',
  updatedAt: 0,
  isDraft: false,
};

function json(body: unknown, status = 200) {
  return {
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(body),
  };
}

/** Las rutas se comprueban en orden: las más concretas primero. */
function routes(list: Array<[string, unknown]>) {
  fetchMock.mockImplementation(async (url: string) => {
    for (const [fragment, body] of list) {
      if (url.includes(fragment)) return typeof body === 'function' ? body() : json(body);
    }
    return json({}, 404);
  });
}

/** Issue con creación, último comentario y última entrada de historial. */
function issueRoutes(opts: {
  created: [string, string];
  comment?: [string, string, unknown?];
  history?: [string, string, Array<{ field: string; to: string | null }>?];
  assignee?: string;
}): Array<[string, unknown]> {
  return [
    [
      '/issue/WEB-12/comment',
      {
        comments: opts.comment
          ? [{ created: opts.comment[0], author: { accountId: opts.comment[1] }, body: opts.comment[2] }]
          : [],
      },
    ],
    [
      '/issue/WEB-12/changelog',
      {
        total: opts.history ? 1 : 0,
        values: opts.history
          ? [{ created: opts.history[0], author: { accountId: opts.history[1] }, items: opts.history[2] ?? [] }]
          : [],
      },
    ],
    [
      '/issue/WEB-12?',
      {
        fields: {
          created: opts.created[0],
          creator: { accountId: opts.created[1] },
          assignee: opts.assignee ? { accountId: opts.assignee } : null,
        },
      },
    ],
  ];
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('JiraProvider.verify', () => {
  it('con un token clásico habla directamente con el sitio', async () => {
    routes([['acme.atlassian.net/rest/api/3/myself', { accountId: ME, displayName: 'Iván' }]]);

    const result = await new JiraProvider().verify(credential);

    expect(result).toMatchObject({
      accountId: ME,
      site: 'acme.atlassian.net',
      apiBase: 'https://acme.atlassian.net',
    });
  });

  it('con un token con scopes pasa por la pasarela de Atlassian', async () => {
    routes([
      ['acme.atlassian.net/rest/api/3/myself', () => json({}, 401)],
      ['acme.atlassian.net/_edge/tenant_info', { cloudId: CLOUD_ID }],
      [`${GATEWAY}/rest/api/3/myself`, { accountId: ME, displayName: 'Iván' }],
    ]);

    const result = await new JiraProvider().verify(credential);

    expect(result.apiBase).toBe(GATEWAY);
  });

  it('si la pasarela también lo rechaza, el token no vale', async () => {
    routes([
      ['/rest/api/3/myself', () => json({}, 401)],
      ['/_edge/tenant_info', { cloudId: CLOUD_ID }],
    ]);

    await expect(new JiraProvider().verify(credential)).rejects.toBeInstanceOf(ProviderAuthError);
  });
});

describe('JiraProvider.listRelevant', () => {
  it('usa la búsqueda nueva y convierte los issues', async () => {
    routes([
      [
        '/rest/api/3/search/jql',
        {
          issues: [
            { key: 'WEB-12', fields: { summary: 'Login', updated: '2026-09-30T10:00:00.000+0000', assignee: { accountId: ME } } },
            { key: 'OPS-3', fields: { summary: 'Backup', updated: '2026-09-29T10:00:00.000+0000', assignee: null } },
          ],
        },
      ],
    ]);

    const items = await new JiraProvider().listRelevant(credential, account);

    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string }];
    expect(url).toBe('https://acme.atlassian.net/rest/api/3/search/jql');
    expect(init.method).toBe('POST');
    expect(items.map((i) => [i.ref, i.reason, i.kind, i.url])).toEqual([
      ['WEB-12', 'assign', 'issue', 'https://acme.atlassian.net/browse/WEB-12'],
      ['OPS-3', 'involved', 'issue', 'https://acme.atlassian.net/browse/OPS-3'],
    ]);
  });
});

describe('JiraProvider.explainChange', () => {
  it('no avisa cuando el último cambio es tuyo', async () => {
    routes(
      issueRoutes({
        created: ['2026-09-01T10:00:00.000+0000', OTHER],
        comment: ['2026-09-30T10:00:00.000+0000', OTHER],
        history: ['2026-09-30T11:00:00.000+0000', ME],
      }),
    );

    expect(await new JiraProvider().explainChange(credential, account, item)).toBeNull();
  });

  it('un comentario de otra persona es un comentario', async () => {
    routes(
      issueRoutes({
        created: ['2026-09-01T10:00:00.000+0000', ME],
        comment: ['2026-09-30T12:00:00.000+0000', OTHER],
        history: ['2026-09-30T11:00:00.000+0000', ME],
      }),
    );

    expect(await new JiraProvider().explainChange(credential, account, item)).toEqual({
      reason: 'comment',
    });
  });

  it('un comentario que te menciona es una mención', async () => {
    const body = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'mention', attrs: { id: ME } }] }],
    };
    routes(
      issueRoutes({
        created: ['2026-09-01T10:00:00.000+0000', ME],
        comment: ['2026-09-30T12:00:00.000+0000', OTHER, body],
      }),
    );

    expect(await new JiraProvider().explainChange(credential, account, item)).toEqual({
      reason: 'mention',
    });
  });

  it('que otra persona te lo asigne es una asignación', async () => {
    routes(
      issueRoutes({
        created: ['2026-09-01T10:00:00.000+0000', OTHER],
        history: ['2026-09-30T12:00:00.000+0000', OTHER, [{ field: 'assignee', to: ME }]],
      }),
    );

    expect(await new JiraProvider().explainChange(credential, account, item)).toEqual({
      reason: 'assign',
    });
  });

  it('un issue que acabas de crear tú no es noticia', async () => {
    routes(issueRoutes({ created: ['2026-09-30T12:00:00.000+0000', ME], assignee: ME }));

    expect(await new JiraProvider().explainChange(credential, account, item)).toBeNull();
  });

  it('un issue creado por otra persona y asignado a ti es una asignación', async () => {
    routes(issueRoutes({ created: ['2026-09-30T12:00:00.000+0000', OTHER], assignee: ME }));

    expect(await new JiraProvider().explainChange(credential, account, item)).toEqual({
      reason: 'assign',
    });
  });
});

describe('splitKey y mentions', () => {
  it('separa la clave en proyecto y número', () => {
    expect(splitKey('WEB-12')).toEqual(['WEB', 12]);
    expect(splitKey('A1_B-7')).toEqual(['A1_B', 7]);
    expect(splitKey('raro')).toEqual(['', 0]);
  });

  it('no confunde una mención a otra persona', () => {
    const body = { type: 'doc', content: [{ type: 'mention', attrs: { id: OTHER } }] };
    expect(mentions(body, ME)).toBe(false);
    expect(mentions(null, ME)).toBe(false);
  });
});

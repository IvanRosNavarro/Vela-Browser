import { describe, expect, it, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();

vi.mock('electron', () => ({
  net: { fetch: (...args: unknown[]) => fetchMock(...args) },
}));

const { GitHubProvider } = await import('./GitHubProvider');
const { ProviderAuthError, ProviderRateLimitError } = await import('../types');

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return {
    status: init.status ?? 200,
    headers: new Headers({ 'content-type': 'application/json', ...(init.headers ?? {}) }),
    text: async () => JSON.stringify(body),
  };
}

const account = {
  provider: 'github' as const,
  login: 'ivan',
  authMethod: 'device-flow' as const,
  hasInbox: true,
  connectedAt: 0,
};

function searchItem(over: Partial<Record<string, unknown>> = {}) {
  return {
    number: 7,
    title: 'Arreglar el sondeo',
    html_url: 'https://github.com/acme/web/pull/7',
    updated_at: '2026-09-20T10:00:00Z',
    repository_url: 'https://api.github.com/repos/acme/web',
    pull_request: {},
    user: { login: 'otra-persona' },
    ...over,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('GitHubProvider.verify', () => {
  it('detecta el buzón por los scopes del token', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ login: 'ivan' }, { headers: { 'x-oauth-scopes': 'notifications, repo' } }),
    );

    const result = await new GitHubProvider().verify({
      token: 't',
      authMethod: 'device-flow',
    });

    expect(result.login).toBe('ivan');
    expect(result.hasInbox).toBe(true);
  });

  it('un PAT fine-grained no declara scopes y se queda sin buzón', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ login: 'ivan' }));

    const result = await new GitHubProvider().verify({ token: 't', authMethod: 'token' });

    expect(result.hasInbox).toBe(false);
  });

  it('un token rechazado pide volver a conectar', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, { status: 401 }));

    await expect(
      new GitHubProvider().verify({ token: 't', authMethod: 'token' }),
    ).rejects.toBeInstanceOf(ProviderAuthError);
  });

  it('distingue el límite de peticiones de un fallo de credencial', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({}, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
    );

    await expect(
      new GitHubProvider().verify({ token: 't', authMethod: 'token' }),
    ).rejects.toBeInstanceOf(ProviderRateLimitError);
  });
});

describe('GitHubProvider.listRelevant', () => {
  it('marca como propias las pull requests que abrió el usuario', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ items: [searchItem({ user: { login: 'ivan' } })] }))
      .mockResolvedValueOnce(jsonResponse([]));

    const [pr] = await new GitHubProvider().listRelevant({ token: 't', authMethod: 'device-flow' }, account);

    expect(pr).toMatchObject({
      id: 'github:acme/web#7',
      repo: 'acme/web',
      reason: 'author',
      url: 'https://github.com/acme/web/pull/7',
    });
  });

  it('la revisión solicitada gana a la mera implicación en el mismo hilo', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [searchItem()] }))
      .mockResolvedValueOnce(jsonResponse({ items: [searchItem()] }))
      .mockResolvedValueOnce(jsonResponse([]));

    const result = await new GitHubProvider().listRelevant({ token: 't', authMethod: 'device-flow' }, account);

    expect(result).toHaveLength(1);
    expect(result[0]?.reason).toBe('review_requested');
  });

  it('descarta las incidencias que no son pull requests', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ ...searchItem(), pull_request: undefined }] }),
      )
      .mockResolvedValueOnce(jsonResponse([]));

    const result = await new GitHubProvider().listRelevant({ token: 't', authMethod: 'device-flow' }, account);

    expect(result).toHaveLength(0);
  });

  it('el buzón afina el motivo de lo que la búsqueda ya encontró', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ items: [searchItem()] }))
      .mockResolvedValueOnce(
        jsonResponse([
          {
            reason: 'comment',
            updated_at: '2026-09-20T10:05:00Z',
            subject: {
              title: 'Arreglar el sondeo',
              url: 'https://api.github.com/repos/acme/web/pulls/7',
              type: 'PullRequest',
            },
            repository: { full_name: 'acme/web' },
          },
        ]),
      );

    const [pr] = await new GitHubProvider().listRelevant({ token: 't', authMethod: 'device-flow' }, account);

    expect(pr?.reason).toBe('comment');
  });

  it('sin buzón no se consulta el buzón', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(jsonResponse({ items: [searchItem()] }));

    await new GitHubProvider().listRelevant(
      { token: 't', authMethod: 'token' },
      { ...account, hasInbox: false, authMethod: 'token' },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

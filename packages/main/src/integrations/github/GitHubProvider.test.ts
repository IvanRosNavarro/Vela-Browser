import { describe, expect, it, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();

vi.mock('electron', () => ({
  net: { fetch: (...args: unknown[]) => fetchMock(...args) },
}));

const { GitHubProvider, latestTimelineEvent } = await import('./GitHubProvider');
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

describe('GitHubProvider.explainChange', () => {
  const updatedAt = Date.parse('2026-10-06T10:00:00Z');
  const item = {
    id: 'github:acme/web#7',
    provider: 'github' as const,
    kind: 'pull-request' as const,
    repo: 'acme/web',
    number: 7,
    ref: 'acme/web#7',
    title: 'Arreglar el sondeo',
    url: 'https://github.com/acme/web/pull/7',
    reason: 'author' as const,
    updatedAt,
    isDraft: false,
  };
  const credential = { token: 't', authMethod: 'device-flow' as const };

  function thread(updated: string, reason = 'comment', number = 7) {
    return {
      reason,
      updated_at: updated,
      subject: {
        title: 'Arreglar el sondeo',
        url: `https://api.github.com/repos/acme/web/pulls/${number}`,
        type: 'PullRequest',
      },
      repository: { full_name: 'acme/web' },
    };
  }

  it('una PR nueva avisa aunque la hayas abierto tú, sin preguntar a nadie', async () => {
    const result = await new GitHubProvider().explainChange(credential, account, item, true);

    expect(result).toEqual({ reason: 'author' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('con buzón', () => {
    it('si el hilo se movió a la vez que la PR, fue otra persona', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse([thread('2026-10-06T10:00:05Z', 'comment')]));

      const result = await new GitHubProvider().explainChange(credential, account, item, false);

      expect(result).toEqual({ reason: 'comment' });
      // Incluye los ya leídos: si lo viste en la web, sigue sin ser cosa tuya.
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('all=true');
    });

    it('sin hilo, el cambio fue tuyo: GitHub no te avisa de lo que haces tú', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse([thread('2026-10-06T10:00:00Z', 'comment', 99)]));

      expect(await new GitHubProvider().explainChange(credential, account, item, false)).toBeNull();
    });

    it('con un hilo anterior al cambio, el cambio también fue tuyo', async () => {
      // Alguien comentó a las 9; tú respondiste a las 10 y eso movió la PR.
      fetchMock.mockResolvedValueOnce(jsonResponse([thread('2026-10-06T09:00:00Z')]));

      expect(await new GitHubProvider().explainChange(credential, account, item, false)).toBeNull();
    });

    it('si el buzón no dice nada útil, conserva el motivo del listado', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse([thread('2026-10-06T10:00:00Z', 'subscribed')]));

      expect(await new GitHubProvider().explainChange(credential, account, item, false)).toEqual({
        reason: 'author',
      });
    });
  });

  describe('sin buzón (token fine-grained)', () => {
    const noInbox = { ...account, hasInbox: false, authMethod: 'token' as const };
    const tokenCredential = { token: 't', authMethod: 'token' as const };

    it('no avisa si lo último en la línea de tiempo lo hiciste tú', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse([
          { event: 'commented', created_at: '2026-10-06T09:00:00Z', user: { login: 'otra' } },
          { event: 'commented', created_at: '2026-10-06T10:00:00Z', user: { login: 'Ivan' } },
        ]),
      );

      expect(
        await new GitHubProvider().explainChange(tokenCredential, noInbox, item, false),
      ).toBeNull();
    });

    it('va a la última página: la línea de tiempo empieza por lo más antiguo', async () => {
      const last = 'https://api.github.com/repositories/1/issues/7/timeline?per_page=100&page=3';
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(
            [{ event: 'commented', created_at: '2026-09-01T00:00:00Z', user: { login: 'ivan' } }],
            { headers: { link: `<${last}>; rel="last"` } },
          ),
        )
        .mockResolvedValueOnce(
          jsonResponse([
            { event: 'reviewed', submitted_at: '2026-10-06T10:00:00Z', user: { login: 'otra' } },
          ]),
        );

      const result = await new GitHubProvider().explainChange(tokenCredential, noInbox, item, false);

      expect(String(fetchMock.mock.calls[1]?.[0])).toBe(last);
      expect(result).toEqual({ reason: 'reviewed' });
    });

    it('no sigue una cabecera Link que apunte fuera de la API', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          [{ event: 'commented', created_at: '2026-10-06T10:00:00Z', user: { login: 'otra' } }],
          { headers: { link: '<https://evil.example.com/x>; rel="last"' } },
        ),
      );

      await new GitHubProvider().explainChange(tokenCredential, noInbox, item, false);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('sin permiso para la línea de tiempo, avisa con el motivo del listado', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { status: 403 }));

      expect(
        await new GitHubProvider().explainChange(tokenCredential, noInbox, item, false),
      ).toEqual({ reason: 'author' });
    });
  });
});

describe('latestTimelineEvent', () => {
  it('reconoce que te piden revisión y que te asignan', () => {
    expect(
      latestTimelineEvent(
        [
          {
            event: 'review_requested',
            created_at: '2026-10-06T10:00:00Z',
            actor: { login: 'otra' },
            requested_reviewer: { login: 'ivan' },
          },
        ],
        'ivan',
      ),
    ).toMatchObject({ login: 'otra', reason: 'review_requested' });

    expect(
      latestTimelineEvent(
        [
          {
            event: 'assigned',
            created_at: '2026-10-06T10:00:00Z',
            actor: { login: 'otra' },
            assignee: { login: 'IVAN' },
          },
        ],
        'ivan',
      ),
    ).toMatchObject({ reason: 'assign' });
  });

  it('cuenta los comentarios en línea de una revisión', () => {
    const latest = latestTimelineEvent(
      [
        { event: 'commented', created_at: '2026-10-06T09:00:00Z', user: { login: 'ivan' } },
        {
          event: 'line-commented',
          comments: [{ created_at: '2026-10-06T11:00:00Z', user: { login: 'otra' } }],
        },
      ],
      'ivan',
    );

    expect(latest).toMatchObject({ login: 'otra', reason: 'comment' });
  });

  it('ignora los commits: traen el autor de git, no la cuenta de GitHub', () => {
    const latest = latestTimelineEvent(
      [
        { event: 'commented', created_at: '2026-10-06T09:00:00Z', user: { login: 'otra' } },
        { event: 'committed', created_at: '2026-10-06T12:00:00Z' },
        { event: 'labeled', created_at: '2026-10-06T13:00:00Z', actor: { login: 'bot' } },
      ],
      'ivan',
    );

    expect(latest).toMatchObject({ login: 'otra', reason: 'comment' });
  });
});

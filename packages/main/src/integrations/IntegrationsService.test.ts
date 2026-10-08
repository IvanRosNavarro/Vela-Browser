import { describe, expect, it, vi, beforeEach } from 'vitest';
import type {
  IntegrationAccount,
  IntegrationItem,
  IntegrationProviderId,
  IntegrationReason,
} from '@vela/shared';

vi.mock('electron', () => ({ net: { fetch: vi.fn() } }));

const { IntegrationsService } = await import('./IntegrationsService');
const { TokenStore } = await import('./TokenStore');
const { ProviderAuthError, ProviderRateLimitError } = await import('./types');
type PrProvider = import('./types').PrProvider;

const PROFILE = 'perfil-1';

/** `settings_profile` en memoria: basta para lo que toca el servicio. */
function fakeSettings() {
  const map = new Map<string, string>();
  return {
    get: (k: string) => map.get(k) ?? null,
    set: (k: string, v: string) => void map.set(k, v),
    delete: (k: string) => void map.delete(k),
    _map: map,
  };
}

/** safeStorage falso: cifrar es una envoltura reversible, suficiente aquí. */
const safeStorageStub = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(`enc:${s}`),
  decryptString: (b: Buffer) => b.toString().replace(/^enc:/, ''),
};

function pr(over: Partial<IntegrationItem> = {}): IntegrationItem {
  const number = over.number ?? 7;
  return {
    id: 'github:acme/web#7',
    provider: 'github',
    kind: 'pull-request',
    repo: 'acme/web',
    number,
    ref: `acme/web#${number}`,
    title: 'Arreglar el sondeo',
    url: 'https://github.com/acme/web/pull/7',
    reason: 'review_requested',
    updatedAt: 1_000,
    isDraft: false,
    ...over,
  };
}

const account: IntegrationAccount = {
  provider: 'github',
  login: 'ivan',
  authMethod: 'token',
  hasInbox: true,
  connectedAt: 0,
};

class FakeProvider implements PrProvider {
  readonly supportsDeviceFlow = true;
  pending: IntegrationItem[] = [];
  nextError: Error | null = null;
  calls = 0;
  /** Lo que devuelve `explainChange` por id; sin entrada, el método no existe. */
  explanations: Map<string, { reason: IntegrationReason } | null> | null = null;
  explainCalls: Array<{ id: string; isNew: boolean }> = [];
  lastCredential: import('./types').ProviderCredential | null = null;

  constructor(readonly id: IntegrationProviderId = 'github') {}

  startDeviceAuthorization = vi.fn();
  pollDeviceAuthorization = vi.fn();

  async verify(credential: import('./types').ProviderCredential): Promise<IntegrationAccount> {
    this.lastCredential = credential;
    return { ...account, provider: this.id, site: credential.site };
  }

  lastKnownIds: readonly string[] | null = null;

  async listRelevant(
    _credential: unknown,
    _account: unknown,
    context?: { knownIds: readonly string[] },
  ): Promise<IntegrationItem[]> {
    this.calls++;
    this.lastKnownIds = context?.knownIds ?? null;
    if (this.nextError) {
      const err = this.nextError;
      this.nextError = null;
      throw err;
    }
    return this.pending;
  }

  overviewUrl(): string {
    return 'https://example.test/overview';
  }

  get explainChange() {
    const explanations = this.explanations;
    if (!explanations) return undefined;
    return async (
      _credential: unknown,
      _account: unknown,
      item: IntegrationItem,
      isNew: boolean,
    ) => {
      this.explainCalls.push({ id: item.id, isNew });
      return explanations.has(item.id) ? explanations.get(item.id)! : { reason: item.reason };
    };
  }
}

function setup(providerId: IntegrationProviderId = 'github') {
  const settings = fakeSettings();
  const provider = new FakeProvider(providerId);
  const notifications: Array<{ title: string; body?: string; url: string }> = [];

  const service = new IntegrationsService({
    profileManager: {
      getRepositories: () => ({ settings }),
      getOpenProfileIds: () => [PROFILE],
    } as never,
    notificationManager: {
      notifyFromVela: (data: { title: string; body?: string; url: string }) => {
        notifications.push(data);
      },
    } as never,
    events: { emit: vi.fn(), on: vi.fn() } as never,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
    tokenStore: new TokenStore(safeStorageStub),
    openUrl: vi.fn(),
    providers: new Map<IntegrationProviderId, PrProvider>([[providerId, provider]]),
  });

  return { service, provider, notifications, settings };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('IntegrationsService', () => {
  it('al conectar no avisa de lo que ya había', async () => {
    const { service, provider, notifications } = setup();
    provider.pending = [pr(), pr({ id: 'github:acme/web#8', number: 8 })];

    await service.connectWithToken(PROFILE, 'github', 'token-de-prueba');

    expect(notifications).toHaveLength(0);
    expect(service.getStatus(PROFILE, 'github').pending).toHaveLength(2);
  });

  it('avisa de lo que aparece después de conectar', async () => {
    const { service, provider, notifications } = setup();
    provider.pending = [pr()];
    await service.connectWithToken(PROFILE, 'github', 'token-de-prueba');

    provider.pending = [pr(), pr({ id: 'github:acme/web#9', number: 9, title: 'Nueva' })];
    await service.checkNow(PROFILE, 'github');

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.body).toBe('Nueva');
  });

  it('vuelve a avisar cuando una pull request ya vista se mueve', async () => {
    const { service, provider, notifications } = setup();
    provider.pending = [pr({ updatedAt: 1_000 })];
    await service.connectWithToken(PROFILE, 'github', 'token-de-prueba');

    provider.pending = [pr({ updatedAt: 2_000, reason: 'comment' })];
    await service.checkNow(PROFILE, 'github');

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.title).toContain('acme/web#7');
  });

  it('no repite el aviso si nada ha cambiado', async () => {
    const { service, provider, notifications } = setup();
    provider.pending = [pr()];
    await service.connectWithToken(PROFILE, 'github', 'token-de-prueba');

    await service.checkNow(PROFILE, 'github');
    await service.checkNow(PROFILE, 'github');

    expect(notifications).toHaveLength(0);
  });

  it('con muchas novedades avisa de unas pocas y resume el resto', async () => {
    const { service, provider, notifications } = setup();
    provider.pending = [];
    await service.connectWithToken(PROFILE, 'github', 'token-de-prueba');

    provider.pending = Array.from({ length: 8 }, (_, i) =>
      pr({ id: `github:acme/web#${i}`, number: i }),
    );
    await service.checkNow(PROFILE, 'github');

    // 5 avisos individuales + 1 resumen
    expect(notifications).toHaveLength(6);
    expect(notifications[5]?.title).toContain('3');
  });

  it('un token rechazado desconecta la cuenta y borra la credencial', async () => {
    const { service, provider, settings } = setup();
    provider.pending = [pr()];
    await service.connectWithToken(PROFILE, 'github', 'token-de-prueba');
    expect(settings.get('integrations:github:token')).not.toBeNull();

    provider.nextError = new ProviderAuthError('El token no es válido o ha caducado.');
    await service.checkNow(PROFILE, 'github');

    const status = service.getStatus(PROFILE, 'github');
    expect(status.phase).toBe('error');
    expect(status.account).toBeNull();
    expect(settings.get('integrations:github:token')).toBeNull();
  });

  it('el límite de peticiones no desconecta: se reintenta más tarde', async () => {
    const { service, provider, settings } = setup();
    provider.pending = [pr()];
    await service.connectWithToken(PROFILE, 'github', 'token-de-prueba');

    provider.nextError = new ProviderRateLimitError(60_000);
    await service.checkNow(PROFILE, 'github');

    const status = service.getStatus(PROFILE, 'github');
    expect(status.phase).toBe('connected');
    expect(status.account).not.toBeNull();
    expect(settings.get('integrations:github:token')).not.toBeNull();
  });

  it('el token se guarda cifrado, nunca en claro', async () => {
    const { service, settings } = setup();
    await service.connectWithToken(PROFILE, 'github', 'token-secreto');

    const stored = settings.get('integrations:github:token');
    expect(stored).not.toContain('token-secreto');
    expect(Buffer.from(stored!, 'base64').toString()).toBe('enc:token-secreto');
  });

  it('desconectar deja el perfil sin rastro de la cuenta', async () => {
    const { service, settings } = setup();
    await service.connectWithToken(PROFILE, 'github', 'token-de-prueba');

    service.disconnect(PROFILE, 'github');

    expect(settings.get('integrations:github:token')).toBeNull();
    expect(settings.get('integrations:github:account')).toBeNull();
    expect(service.getStatus(PROFILE, 'github').phase).toBe('disconnected');
  });
});

describe('IntegrationsService — cambios propios', () => {
  it('no avisa de un cambio que hizo el propio usuario', async () => {
    const { service, provider, notifications } = setup('jira');
    provider.pending = [pr({ provider: 'jira', updatedAt: 1_000 })];
    await service.connectWithToken(PROFILE, 'jira', 'token-de-prueba', {
      email: 'yo@acme.com',
      site: 'acme',
    });

    provider.explanations = new Map([['github:acme/web#7', null]]);
    provider.pending = [pr({ provider: 'jira', updatedAt: 2_000 })];
    await service.checkNow(PROFILE, 'jira');

    expect(notifications).toHaveLength(0);
  });

  it('avisa con el motivo que da el proveedor, no con el del listado', async () => {
    const { service, provider, notifications } = setup('jira');
    provider.pending = [pr({ updatedAt: 1_000, reason: 'involved' })];
    await service.connectWithToken(PROFILE, 'jira', 'token-de-prueba', {
      email: 'yo@acme.com',
      site: 'acme',
    });

    provider.explanations = new Map([['github:acme/web#7', { reason: 'mention' }]]);
    provider.pending = [pr({ updatedAt: 2_000, reason: 'involved' })];
    await service.checkNow(PROFILE, 'jira');

    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.title).toContain('Te han mencionado');
  });

  it('dice al proveedor si el elemento es nuevo o ya visto', async () => {
    const { service, provider } = setup('bitbucket');
    provider.pending = [pr({ updatedAt: 1_000 })];
    await service.connectWithToken(PROFILE, 'bitbucket', 'token-de-prueba', {
      email: 'yo@acme.com',
    });

    provider.explanations = new Map();
    provider.pending = [
      pr({ updatedAt: 2_000 }),
      pr({ id: 'github:acme/web#9', number: 9, updatedAt: 2_000 }),
    ];
    await service.checkNow(PROFILE, 'bitbucket');

    expect(provider.explainCalls).toEqual([
      { id: 'github:acme/web#7', isNew: false },
      { id: 'github:acme/web#9', isNew: true },
    ]);
  });

  it('lo filtrado tampoco vuelve a salir en la ronda siguiente', async () => {
    const { service, provider, notifications } = setup('jira');
    provider.pending = [pr({ updatedAt: 1_000 })];
    await service.connectWithToken(PROFILE, 'jira', 'token-de-prueba', {
      email: 'yo@acme.com',
      site: 'acme',
    });

    provider.explanations = new Map([['github:acme/web#7', null]]);
    provider.pending = [pr({ updatedAt: 2_000 })];
    await service.checkNow(PROFILE, 'jira');
    provider.explanations = new Map();
    await service.checkNow(PROFILE, 'jira');

    expect(notifications).toHaveLength(0);
  });
});

describe('IntegrationsService — memoria entre rondas', () => {
  it('entrega al proveedor los ids ya vistos, que sobreviven al reinicio', async () => {
    const { service, provider } = setup('bitbucket');
    provider.pending = [pr({ id: 'bitbucket:acme/viejo#4' })];
    await service.connectWithToken(PROFILE, 'bitbucket', 'token-de-prueba', {
      email: 'yo@acme.com',
    });

    await service.checkNow(PROFILE, 'bitbucket');

    expect(provider.lastKnownIds).toEqual(['bitbucket:acme/viejo#4']);
  });
});

describe('IntegrationsService — credenciales de Atlassian', () => {
  it('exige el email: los API tokens de Atlassian van con él', async () => {
    const { service, settings } = setup('bitbucket');

    await expect(
      service.connectWithToken(PROFILE, 'bitbucket', 'token-de-prueba'),
    ).rejects.toBeInstanceOf(ProviderAuthError);
    expect(settings.get('integrations:bitbucket:token')).toBeNull();
  });

  it('rechaza un sitio de Jira que no sea de Atlassian sin llegar a pedir nada', async () => {
    const { service, provider, settings } = setup('jira');

    await expect(
      service.connectWithToken(PROFILE, 'jira', 'token-de-prueba', {
        email: 'yo@acme.com',
        site: 'https://evil.example.com',
      }),
    ).rejects.toBeInstanceOf(ProviderAuthError);
    expect(provider.lastCredential).toBeNull();
    expect(settings.get('integrations:jira:token')).toBeNull();
  });

  it('guarda email, sitio y token juntos y cifrados', async () => {
    const { service, provider, settings } = setup('jira');

    await service.connectWithToken(PROFILE, 'jira', 'token-secreto', {
      email: 'yo@acme.com',
      site: 'https://Acme.atlassian.net/jira/your-work',
    });

    expect(provider.lastCredential?.site).toBe('acme.atlassian.net');
    const stored = Buffer.from(settings.get('integrations:jira:token')!, 'base64').toString();
    expect(stored.startsWith('enc:')).toBe(true);
    expect(JSON.parse(stored.slice(4))).toEqual({
      token: 'token-secreto',
      email: 'yo@acme.com',
      site: 'acme.atlassian.net',
    });
  });

  it('una cuenta de GitHub de v0.3.0 (token sin envoltorio) sigue funcionando', async () => {
    const { service, provider, settings } = setup('github');
    settings.set('integrations:github:token', Buffer.from('enc:token-antiguo').toString('base64'));
    settings.set('integrations:github:account', JSON.stringify(account));
    provider.pending = [pr()];

    await service.checkNow(PROFILE, 'github');

    expect(provider.calls).toBe(1);
    expect(service.getStatus(PROFILE, 'github').phase).toBe('connected');
  });
});

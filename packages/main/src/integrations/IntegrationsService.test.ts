import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { IntegrationAccount, PullRequestSummary } from '@vela/shared';

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

function pr(over: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    id: 'github:acme/web#7',
    provider: 'github',
    repo: 'acme/web',
    number: 7,
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
  readonly id = 'github' as const;
  readonly supportsDeviceFlow = true;
  pending: PullRequestSummary[] = [];
  nextError: Error | null = null;
  calls = 0;

  startDeviceAuthorization = vi.fn();
  pollDeviceAuthorization = vi.fn();

  async verify(): Promise<IntegrationAccount> {
    return account;
  }

  async listRelevant(): Promise<PullRequestSummary[]> {
    this.calls++;
    if (this.nextError) {
      const err = this.nextError;
      this.nextError = null;
      throw err;
    }
    return this.pending;
  }
}

function setup() {
  const settings = fakeSettings();
  const provider = new FakeProvider();
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
    providers: new Map([['github', provider]]),
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

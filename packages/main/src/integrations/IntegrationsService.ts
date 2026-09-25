import { IPC_EVENTS } from '@vela/shared';
import type {
  DeviceFlowPrompt,
  IntegrationAccount,
  IntegrationProviderId,
  IntegrationsStatus,
  PullRequestReason,
  PullRequestSummary,
} from '@vela/shared';
import { PULL_REQUEST_REASON_LABELS } from '@vela/shared';
import type { MainEventBus } from '../ipc/events';
import type { Logger } from '../logger';
import type { ProfileManager } from '../profiles/ProfileManager';
import type { NotificationManager } from '../notifications/NotificationManager';
import { GitHubProvider } from './github/GitHubProvider';
import { TokenStore } from './TokenStore';
import {
  ProviderAuthError,
  ProviderRateLimitError,
  type PrProvider,
  type ProviderCredential,
} from './types';

/**
 * Client id de la OAuth App de Vela. No es un secreto (el device flow no usa
 * client secret), pero sí es propio de cada instalación de la app: quien
 * compile Vela por su cuenta registra la suya y la indica en los ajustes.
 */
const DEFAULT_GITHUB_CLIENT_ID = process.env.VELA_GITHUB_CLIENT_ID ?? '';

/** Cada cuánto se evalúa si toca sondear. El sondeo real va más espaciado. */
const TICK_MS = 30_000;
const POLL_INTERVAL_MS = 2 * 60 * 1000;
/** Tope de avisos por ronda: un backlog grande no debe sepultar al usuario. */
const MAX_NOTIFICATIONS_PER_ROUND = 5;

interface ProfileState {
  status: IntegrationsStatus;
  lastPollAt: number;
  /** Momento antes del cual no se vuelve a pedir nada (límite de peticiones). */
  blockedUntil: number;
  deviceFlow: AbortController | null;
}

export interface IntegrationsServiceCtx {
  profileManager: ProfileManager;
  notificationManager: NotificationManager;
  events: MainEventBus;
  logger: Logger;
  tokenStore: TokenStore;
  /** Abre la PR cuando el usuario pulsa el aviso. */
  openUrl: (profileId: string, url: string) => void;
  now?: () => number;
  /** Se inyectan en los tests; en producción se usan los reales. */
  providers?: Map<IntegrationProviderId, PrProvider>;
}

function emptyStatus(provider: IntegrationProviderId): IntegrationsStatus {
  return {
    provider,
    phase: 'disconnected',
    account: null,
    error: null,
    enabled: true,
    pending: [],
    lastCheckAt: null,
    checking: false,
  };
}

/**
 * Sondea las plataformas conectadas y convierte lo nuevo en notificaciones de
 * Vela. El ciclo es común a todos los proveedores; lo específico de cada
 * plataforma vive en su `PrProvider`.
 */
export class IntegrationsService {
  private readonly providers: Map<IntegrationProviderId, PrProvider>;
  private readonly states = new Map<string, ProfileState>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ctx: IntegrationsServiceCtx) {
    this.providers =
      ctx.providers ??
      new Map<IntegrationProviderId, PrProvider>([['github', new GitHubProvider()]]);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const state of this.states.values()) state.deviceFlow?.abort();
    this.states.clear();
  }

  getStatus(profileId: string, provider: IntegrationProviderId): IntegrationsStatus {
    return this.stateFor(profileId, provider).status;
  }

  // ---------- conexión ----------

  async startDeviceFlow(
    profileId: string,
    provider: IntegrationProviderId,
  ): Promise<DeviceFlowPrompt> {
    const impl = this.providerOrThrow(provider);
    if (!impl.supportsDeviceFlow) {
      throw new ProviderAuthError('Este servicio no permite autorizar por dispositivo.');
    }
    if (!this.ctx.tokenStore.isAvailable()) {
      throw new ProviderAuthError(
        'El sistema no ofrece almacenamiento cifrado, y Vela no guarda un token en claro.',
      );
    }

    const clientId = this.clientIdFor(profileId, provider);
    if (!clientId) {
      throw new ProviderAuthError(
        'Falta el identificador de la aplicación OAuth. Indícalo en los ajustes de la integración.',
      );
    }

    const state = this.stateFor(profileId, provider);
    state.deviceFlow?.abort();
    const controller = new AbortController();
    state.deviceFlow = controller;

    const auth = await impl.startDeviceAuthorization(clientId);
    this.patch(profileId, provider, { phase: 'awaiting-authorization', error: null });

    // El sondeo del código sigue por su cuenta: el renderer ya tiene lo que
    // necesita enseñar y el desenlace le llega por `state:integrations-*`.
    void impl
      .pollDeviceAuthorization(clientId, auth, controller.signal)
      .then(async (token) => {
        if (controller.signal.aborted) return;
        await this.finishConnection(profileId, provider, { token, authMethod: 'device-flow' });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        this.patch(profileId, provider, {
          phase: 'error',
          error: err instanceof Error ? err.message : 'No se pudo completar la autorización',
        });
      })
      .finally(() => {
        if (state.deviceFlow === controller) state.deviceFlow = null;
      });

    return {
      userCode: auth.userCode,
      verificationUri: auth.verificationUri,
      expiresAt: auth.expiresAt,
    };
  }

  cancelDeviceFlow(profileId: string, provider: IntegrationProviderId): void {
    const state = this.stateFor(profileId, provider);
    state.deviceFlow?.abort();
    state.deviceFlow = null;
    if (state.status.phase === 'awaiting-authorization') {
      this.patch(profileId, provider, { phase: 'disconnected', error: null });
    }
  }

  async connectWithToken(
    profileId: string,
    provider: IntegrationProviderId,
    token: string,
  ): Promise<IntegrationsStatus> {
    await this.finishConnection(profileId, provider, { token, authMethod: 'token' });
    return this.getStatus(profileId, provider);
  }

  disconnect(profileId: string, provider: IntegrationProviderId): IntegrationsStatus {
    const state = this.stateFor(profileId, provider);
    state.deviceFlow?.abort();
    state.deviceFlow = null;
    try {
      const settings = this.settingsFor(profileId);
      this.ctx.tokenStore.clear(settings, provider);
    } catch (err) {
      this.ctx.logger.warn('[integrations] no se pudo limpiar la credencial', err);
    }
    state.status = { ...emptyStatus(provider), enabled: state.status.enabled };
    this.emit(profileId, provider);
    return state.status;
  }

  setEnabled(
    profileId: string,
    provider: IntegrationProviderId,
    enabled: boolean,
  ): IntegrationsStatus {
    this.ctx.tokenStore.setEnabled(this.settingsFor(profileId), provider, enabled);
    this.patch(profileId, provider, { enabled });
    if (enabled) void this.poll(profileId, provider, { notify: true });
    return this.getStatus(profileId, provider);
  }

  setClientId(profileId: string, provider: IntegrationProviderId, clientId: string): void {
    this.ctx.tokenStore.setClientId(this.settingsFor(profileId), provider, clientId);
  }

  async checkNow(
    profileId: string,
    provider: IntegrationProviderId,
  ): Promise<IntegrationsStatus> {
    // Una comprobación pedida a mano ignora el límite propio, no el del servidor.
    this.stateFor(profileId, provider).blockedUntil = 0;
    await this.poll(profileId, provider, { notify: true });
    return this.getStatus(profileId, provider);
  }

  // ---------- ciclo ----------

  private async tick(): Promise<void> {
    const now = this.now();
    for (const profileId of this.ctx.profileManager.getOpenProfileIds()) {
      for (const provider of this.providers.keys()) {
        const state = this.stateFor(profileId, provider);
        if (!state.status.enabled || state.status.checking) continue;
        if (now < state.blockedUntil) continue;
        if (now - state.lastPollAt < POLL_INTERVAL_MS) continue;
        if (!this.credentialFor(profileId, provider)) continue;
        await this.poll(profileId, provider, { notify: true });
      }
    }
  }

  private async poll(
    profileId: string,
    provider: IntegrationProviderId,
    opts: { notify: boolean },
  ): Promise<void> {
    const state = this.stateFor(profileId, provider);
    const credential = this.credentialFor(profileId, provider);
    const account = state.status.account;
    if (!credential || !account) return;

    state.lastPollAt = this.now();
    this.patch(profileId, provider, { checking: true });

    try {
      const pending = await this.providerOrThrow(provider).listRelevant(credential, account);
      if (opts.notify) this.notifyNew(profileId, provider, pending);
      else this.rememberSeen(profileId, provider, pending);

      this.patch(profileId, provider, {
        phase: 'connected',
        pending,
        error: null,
        lastCheckAt: this.now(),
        checking: false,
      });
    } catch (err) {
      this.handlePollError(profileId, provider, err);
    }
  }

  private handlePollError(
    profileId: string,
    provider: IntegrationProviderId,
    err: unknown,
  ): void {
    const state = this.stateFor(profileId, provider);

    if (err instanceof ProviderRateLimitError) {
      state.blockedUntil = this.now() + err.retryAfterMs;
      // No es un fallo del usuario ni hay nada que arreglar: se reintenta solo.
      this.patch(profileId, provider, { checking: false });
      return;
    }

    if (err instanceof ProviderAuthError && err.needsReconnect) {
      this.ctx.logger.warn(`[integrations] credencial rechazada en ${provider}`);
      this.ctx.tokenStore.clear(this.settingsFor(profileId), provider);
      state.status = {
        ...emptyStatus(provider),
        enabled: state.status.enabled,
        phase: 'error',
        error: err.message,
      };
      this.emit(profileId, provider);
      return;
    }

    this.ctx.logger.error(`[integrations] fallo sondeando ${provider}`, err);
    this.patch(profileId, provider, {
      checking: false,
      error: err instanceof Error ? err.message : 'No se pudo consultar el servicio',
    });
  }

  // ---------- avisos ----------

  private notifyNew(
    profileId: string,
    provider: IntegrationProviderId,
    pending: PullRequestSummary[],
  ): void {
    const settings = this.settingsFor(profileId);
    const seen = this.ctx.tokenStore.readSeen(settings, provider);

    const fresh = pending.filter((pr) => {
      const last = seen[pr.id];
      return last === undefined || pr.updatedAt > last;
    });

    for (const pr of fresh.slice(0, MAX_NOTIFICATIONS_PER_ROUND)) {
      this.ctx.notificationManager.notifyFromVela({
        profileId,
        title: `${reasonLabel(pr.reason)} · ${pr.repo}#${pr.number}`,
        body: pr.title,
        url: pr.url,
        onActivate: () => this.ctx.openUrl(profileId, pr.url),
      });
    }

    if (fresh.length > MAX_NOTIFICATIONS_PER_ROUND) {
      const rest = fresh.length - MAX_NOTIFICATIONS_PER_ROUND;
      this.ctx.notificationManager.notifyFromVela({
        profileId,
        title: `Y ${rest} ${rest === 1 ? 'pull request más' : 'pull requests más'}`,
        body: 'Ábrelas desde el indicador de la barra de título.',
        url: 'https://github.com/pulls',
        onActivate: () => this.ctx.openUrl(profileId, 'https://github.com/pulls'),
      });
    }

    this.rememberSeen(profileId, provider, pending);
  }

  private rememberSeen(
    profileId: string,
    provider: IntegrationProviderId,
    pending: PullRequestSummary[],
  ): void {
    const settings = this.settingsFor(profileId);
    const seen = this.ctx.tokenStore.readSeen(settings, provider);
    for (const pr of pending) seen[pr.id] = pr.updatedAt;
    this.ctx.tokenStore.saveSeen(settings, provider, seen);
  }

  // ---------- interno ----------

  private async finishConnection(
    profileId: string,
    provider: IntegrationProviderId,
    credential: ProviderCredential,
  ): Promise<void> {
    const impl = this.providerOrThrow(provider);
    const account = await impl.verify(credential);

    const settings = this.settingsFor(profileId);
    this.ctx.tokenStore.saveToken(settings, provider, credential.token);
    this.ctx.tokenStore.saveAccount(settings, provider, account);

    this.patch(profileId, provider, {
      phase: 'connected',
      account,
      error: null,
      enabled: true,
    });

    // Primer sondeo sin avisar: al conectar, todo lo que hay es backlog y
    // notificarlo entero sería una avalancha inútil.
    await this.poll(profileId, provider, { notify: false });
  }

  private stateFor(profileId: string, provider: IntegrationProviderId): ProfileState {
    const mapKey = `${profileId}:${provider}`;
    let state = this.states.get(mapKey);
    if (state) return state;

    state = {
      status: emptyStatus(provider),
      lastPollAt: 0,
      blockedUntil: 0,
      deviceFlow: null,
    };
    this.states.set(mapKey, state);

    // Rehidratar desde el perfil: si ya había cuenta, el sondeo sigue donde lo
    // dejó sin que el usuario vuelva a conectar nada.
    try {
      const settings = this.settingsFor(profileId);
      const account = this.ctx.tokenStore.readAccount(settings, provider);
      const hasToken = this.ctx.tokenStore.readToken(settings, provider) !== null;
      state.status = {
        ...state.status,
        enabled: this.ctx.tokenStore.isEnabled(settings, provider),
        account: hasToken ? account : null,
        phase: hasToken && account ? 'connected' : 'disconnected',
      };
    } catch (err) {
      this.ctx.logger.warn('[integrations] no se pudo leer el estado guardado', err);
    }

    return state;
  }

  private credentialFor(
    profileId: string,
    provider: IntegrationProviderId,
  ): ProviderCredential | null {
    const account = this.stateFor(profileId, provider).status.account;
    if (!account) return null;
    try {
      const token = this.ctx.tokenStore.readToken(this.settingsFor(profileId), provider);
      return token ? { token, authMethod: account.authMethod } : null;
    } catch {
      return null;
    }
  }

  private clientIdFor(profileId: string, provider: IntegrationProviderId): string {
    try {
      const own = this.ctx.tokenStore.readClientId(this.settingsFor(profileId), provider);
      if (own) return own;
    } catch {
      // sin ajustes legibles se cae al identificador por defecto
    }
    return DEFAULT_GITHUB_CLIENT_ID;
  }

  private settingsFor(profileId: string) {
    return this.ctx.profileManager.getRepositories(profileId).settings;
  }

  private providerOrThrow(provider: IntegrationProviderId): PrProvider {
    const impl = this.providers.get(provider);
    if (!impl) throw new ProviderAuthError(`Servicio no soportado: ${provider}`);
    return impl;
  }

  private patch(
    profileId: string,
    provider: IntegrationProviderId,
    patch: Partial<IntegrationsStatus>,
  ): void {
    const state = this.stateFor(profileId, provider);
    state.status = { ...state.status, ...patch };
    this.emit(profileId, provider);
  }

  private emit(profileId: string, provider: IntegrationProviderId): void {
    this.ctx.events.emit(IPC_EVENTS.INTEGRATIONS_STATUS_CHANGED, {
      profileId,
      status: this.stateFor(profileId, provider).status,
    });
  }

  private now(): number {
    return (this.ctx.now ?? Date.now)();
  }
}

function reasonLabel(reason: PullRequestReason): string {
  return PULL_REQUEST_REASON_LABELS[reason];
}

export type { IntegrationAccount };

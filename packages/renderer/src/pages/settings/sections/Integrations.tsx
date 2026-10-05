import { useEffect, useState, type ReactNode } from 'react';
import {
  INTEGRATION_PROVIDER_LABELS,
  INTEGRATION_REASON_LABELS,
  type IntegrationItem,
  type IntegrationProviderId,
  type IntegrationsStatus,
} from '@vela/shared';
import { useIntegrationsStore } from '../../../stores/integrationsStore';
import { writeToClipboard } from '../../../lib/clipboard';

const ATLASSIAN_TOKENS_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';

const BITBUCKET_SCOPES = [
  'read:user:bitbucket',
  'read:workspace:bitbucket',
  'read:repository:bitbucket',
  'read:pullrequest:bitbucket',
];

export function Integrations() {
  const hydrate = useIntegrationsStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div className="space-y-12">
      <p className="text-sm text-[var(--vela-fg-muted)]">
        Vela consulta estas plataformas desde segundo plano y te avisa de lo que te afecta,
        aunque no tengas ninguna pestaña suya abierta. Las credenciales se guardan cifradas
        en este equipo y no viajan con la sincronización.
      </p>

      <ProviderBlock
        provider="github"
        description="Tus pull requests, las que te han pedido revisar y aquellas en las que te han mencionado o comentado."
      >
        <GitHubConnect />
      </ProviderBlock>

      <ProviderBlock
        provider="bitbucket"
        description="Tus pull requests y las que te toca revisar. Te avisa cuando otra persona comenta, revisa o actualiza, no de lo que haces tú."
      >
        <AtlassianConnect provider="bitbucket" />
      </ProviderBlock>

      <ProviderBlock
        provider="jira"
        description="Los issues asignados a ti, los que reportaste y los que vigilas. Te avisa cuando otra persona los cambia, los comenta o te asigna uno, nunca de tus propios cambios. No entran en el contador de la barra de título."
      >
        <AtlassianConnect provider="jira" />
      </ProviderBlock>
    </div>
  );
}

function ProviderBlock({
  provider,
  description,
  children,
}: {
  provider: IntegrationProviderId;
  description: string;
  children: ReactNode;
}) {
  const status = useIntegrationsStore((s) => s.statuses[provider]);
  const connected = status.phase === 'connected' && status.account !== null;

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-base font-semibold text-[var(--vela-fg)]">
          {INTEGRATION_PROVIDER_LABELS[provider]}
        </h2>
        <p className="text-sm text-[var(--vela-fg-muted)]">{description}</p>
      </header>

      {!connected && status.error && <ErrorBox message={status.error} />}
      {connected ? <ConnectedView provider={provider} /> : children}
    </section>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-[var(--vela-danger,#e5534b)] bg-[var(--vela-bg-surface)] px-3 py-2 text-sm text-[var(--vela-fg)]">
      {message}
    </p>
  );
}

const inputClass =
  'flex-1 rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg)] px-3 py-2 text-sm text-[var(--vela-fg)]';

// ── GitHub ─────────────────────────────────────────────────────────────────

function GitHubConnect() {
  const devicePrompt = useIntegrationsStore((s) => s.devicePrompt);
  const busy = useIntegrationsStore((s) => s.busy === 'github');
  const startDeviceFlow = useIntegrationsStore((s) => s.startDeviceFlow);
  const connectToken = useIntegrationsStore((s) => s.connectToken);
  const setClientId = useIntegrationsStore((s) => s.setClientId);

  const [token, setToken] = useState('');
  const [clientId, setClientIdValue] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (devicePrompt) return <DeviceCodeView />;

  const handleDeviceFlow = async () => {
    setError(null);
    setError(await startDeviceFlow());
  };

  const handleToken = async () => {
    setError(null);
    const message = await connectToken('github', { token: token.trim() });
    if (message) setError(message);
    else setToken('');
  };

  return (
    <div className="space-y-6">
      {error && <ErrorBox message={error} />}

      <div className="space-y-3 rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] p-5">
        <h3 className="text-sm font-semibold text-[var(--vela-fg)]">
          Iniciar sesión con tu cuenta
        </h3>
        <p className="text-sm text-[var(--vela-fg-muted)]">
          Vela te dará un código y lo autorizas en github.com. Pide permiso de lectura
          sobre tus repositorios y tus avisos: con menos que eso GitHub no deja ver las
          pull requests privadas ni clasificar qué ha pasado en cada una.
        </p>
        <button
          onClick={() => void handleDeviceFlow()}
          disabled={busy}
          className="rounded-md bg-[var(--vela-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Conectando…' : 'Conectar con GitHub'}
        </button>
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--vela-border)] p-5">
        <h3 className="text-sm font-semibold text-[var(--vela-fg)]">
          O pegar un token de acceso personal
        </h3>
        <p className="text-sm text-[var(--vela-fg-muted)]">
          Si prefieres dar el permiso mínimo, crea un token <em>fine-grained</em> con{' '}
          <code>Pull requests: read</code> solo en los repositorios que te interesen. A
          cambio, GitHub no permite leer el buzón de avisos con esos tokens: sabrás que la
          pull request se ha movido, pero no siempre qué ha pasado en ella.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_…"
            className={inputClass}
          />
          <button
            onClick={() => void handleToken()}
            disabled={busy || token.trim().length < 8}
            className="rounded-md border border-[var(--vela-border)] px-4 py-2 text-sm text-[var(--vela-fg)] disabled:opacity-50"
          >
            Conectar
          </button>
        </div>
      </div>

      <div>
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs text-[var(--vela-fg-muted)] underline"
        >
          {showAdvanced ? 'Ocultar opciones avanzadas' : 'Opciones avanzadas'}
        </button>
        {showAdvanced && (
          <div className="mt-3 space-y-2 rounded-lg border border-[var(--vela-border)] p-4">
            <p className="text-xs text-[var(--vela-fg-muted)]">
              Identificador de tu propia aplicación OAuth de GitHub, si has compilado Vela
              por tu cuenta o quieres usar la de tu organización. Debe tener activado
              <em> Enable Device Flow</em>. En blanco se usa la de Vela.
            </p>
            <div className="flex gap-2">
              <input
                value={clientId}
                onChange={(e) => setClientIdValue(e.target.value)}
                placeholder="Ov23li…"
                className={inputClass}
              />
              <button
                onClick={() => void setClientId(clientId.trim())}
                className="rounded-md border border-[var(--vela-border)] px-4 py-2 text-sm text-[var(--vela-fg)]"
              >
                Guardar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceCodeView() {
  const devicePrompt = useIntegrationsStore((s) => s.devicePrompt);
  const cancelDeviceFlow = useIntegrationsStore((s) => s.cancelDeviceFlow);
  const openPr = useIntegrationsStore((s) => s.openPr);
  const [copied, setCopied] = useState(false);

  if (!devicePrompt) return null;

  const handleCopy = async () => {
    await writeToClipboard(devicePrompt.userCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4 rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] p-6">
      <h3 className="text-sm font-semibold text-[var(--vela-fg)]">Autoriza Vela en GitHub</h3>
      <p className="text-sm text-[var(--vela-fg-muted)]">
        Abre la página de GitHub e introduce este código. Vela se conectará sola en cuanto
        lo apruebes.
      </p>
      <div className="flex items-center gap-3">
        <code className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg)] px-4 py-3 text-xl font-semibold tracking-[0.3em] text-[var(--vela-accent)]">
          {devicePrompt.userCode}
        </code>
        <button
          onClick={() => void handleCopy()}
          className="rounded-md border border-[var(--vela-border)] px-3 py-2 text-sm text-[var(--vela-fg)]"
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => void openPr(devicePrompt.verificationUri)}
          className="rounded-md bg-[var(--vela-accent)] px-4 py-2 text-sm font-medium text-white"
        >
          Abrir github.com/login/device
        </button>
        <button
          onClick={() => void cancelDeviceFlow()}
          className="rounded-md border border-[var(--vela-border)] px-4 py-2 text-sm text-[var(--vela-fg)]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Bitbucket y Jira ───────────────────────────────────────────────────────

/**
 * Atlassian no ofrece a una app de escritorio de código abierto un inicio de
 * sesión sin secreto (su OAuth exige client secret y no admite PKCE ni device
 * flow), así que se pega un API token. La pantalla compensa diciendo
 * exactamente cuál crear.
 */
function AtlassianConnect({ provider }: { provider: 'bitbucket' | 'jira' }) {
  const busy = useIntegrationsStore((s) => s.busy === provider);
  const connectToken = useIntegrationsStore((s) => s.connectToken);
  const openPr = useIntegrationsStore((s) => s.openPr);

  const [site, setSite] = useState('');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isJira = provider === 'jira';
  const ready =
    email.includes('@') && token.trim().length >= 8 && (!isJira || site.trim().length > 0);

  const handleConnect = async () => {
    setError(null);
    const message = await connectToken(provider, {
      token: token.trim(),
      email: email.trim(),
      ...(isJira ? { site: site.trim() } : {}),
    });
    if (message) setError(message);
    else setToken('');
  };

  return (
    <div className="space-y-4 rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] p-5">
      {error && <ErrorBox message={error} />}

      <div className="space-y-2 text-sm text-[var(--vela-fg-muted)]">
        {isJira ? (
          <p>
            Crea un API token en tu cuenta de Atlassian. Lo más sencillo es uno clásico, sin
            ámbitos; si prefieres uno con ámbitos, elige Jira y marca{' '}
            <code>read:jira-work</code> y <code>read:jira-user</code>. Vela funciona con los
            dos.
          </p>
        ) : (
          <>
            <p>
              Crea un API token <strong>con ámbitos</strong>, elige Bitbucket y marca estos
              cuatro permisos de lectura:
            </p>
            <ul className="ml-4 list-disc font-mono text-xs">
              {BITBUCKET_SCOPES.map((scope) => (
                <li key={scope}>{scope}</li>
              ))}
            </ul>
            <p>
              Los <em>app passwords</em> ya no sirven: Atlassian los retiró en junio de 2026.
            </p>
          </>
        )}
        <button
          onClick={() => void openPr(ATLASSIAN_TOKENS_URL)}
          className="text-[var(--vela-accent)] underline"
        >
          Abrir la página de API tokens de Atlassian
        </button>
      </div>

      <div className="space-y-2">
        {isJira && (
          <input
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="Tu sitio: acme.atlassian.net"
            className={`${inputClass} w-full`}
          />
        )}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email de tu cuenta de Atlassian"
          className={`${inputClass} w-full`}
        />
        <div className="flex gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="API token"
            className={inputClass}
          />
          <button
            onClick={() => void handleConnect()}
            disabled={busy || !ready}
            className="rounded-md bg-[var(--vela-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Conectando…' : 'Conectar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Conectado ──────────────────────────────────────────────────────────────

function accountSummary(provider: IntegrationProviderId, status: IntegrationsStatus): string {
  const account = status.account;
  if (!account) return '';
  if (provider === 'github') {
    const how =
      account.authMethod === 'device-flow'
        ? 'Sesión autorizada desde este equipo'
        : 'Token de acceso personal';
    const inbox = account.hasInbox
      ? ' · avisos detallados'
      : ' · sin buzón: los avisos no distinguen el motivo';
    return how + inbox;
  }
  if (provider === 'jira') return `API token de Atlassian · ${account.site ?? ''}`;
  return 'API token de Atlassian';
}

function useStatus(provider: IntegrationProviderId) {
  return useIntegrationsStore((s) => s.statuses[provider]);
}

function ConnectedView({ provider }: { provider: IntegrationProviderId }) {
  const status = useStatus(provider);
  const busy = useIntegrationsStore((s) => s.busy === provider);
  const checkNow = useIntegrationsStore((s) => s.checkNow);
  const disconnect = useIntegrationsStore((s) => s.disconnect);
  const setEnabled = useIntegrationsStore((s) => s.setEnabled);
  const openPr = useIntegrationsStore((s) => s.openPr);

  const account = status.account;
  if (!account) return null;

  const isJira = provider === 'jira';

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] p-5">
        <div>
          <p className="text-sm font-medium text-[var(--vela-fg)]">
            Conectado como <strong>{account.login}</strong>
          </p>
          <p className="mt-1 text-xs text-[var(--vela-fg-muted)]">
            {accountSummary(provider, status)}
          </p>
        </div>
        <button
          onClick={() => void disconnect(provider)}
          className="rounded-md border border-[var(--vela-border)] px-3 py-2 text-sm text-[var(--vela-fg)]"
        >
          Desconectar
        </button>
      </div>

      <label className="flex items-center gap-3 text-sm text-[var(--vela-fg)]">
        <input
          type="checkbox"
          checked={status.enabled}
          onChange={(e) => void setEnabled(provider, e.target.checked)}
        />
        {isJira
          ? 'Avisarme cuando otras personas toquen mis issues'
          : 'Avisarme de las pull requests que me afectan'}
      </label>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--vela-fg)]">
            {isJira
              ? `Con movimiento en los últimos 14 días: ${status.pending.length}`
              : `Te esperan ${status.pending.length}`}
          </h3>
          <button
            onClick={() => void checkNow(provider)}
            disabled={busy || status.checking}
            className="text-xs text-[var(--vela-fg-muted)] underline disabled:opacity-50"
          >
            {status.checking ? 'Comprobando…' : 'Comprobar ahora'}
          </button>
        </div>

        {status.error && (
          <p className="text-sm text-[var(--vela-danger,#e5534b)]">{status.error}</p>
        )}

        {status.pending.length === 0 ? (
          <p className="text-sm text-[var(--vela-fg-muted)]">Nada pendiente ahora mismo.</p>
        ) : (
          <ul className="divide-y divide-[var(--vela-border)] rounded-lg border border-[var(--vela-border)]">
            {status.pending.map((item) => (
              <ItemRow key={item.id} item={item} onOpen={() => void openPr(item.url)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ItemRow({ item, onOpen }: { item: IntegrationItem; onOpen: () => void }) {
  return (
    <li>
      <button
        onClick={onOpen}
        className="flex w-full flex-col items-start gap-1 px-4 py-3 text-left hover:bg-[var(--vela-bg-surface)]"
      >
        <span className="text-sm text-[var(--vela-fg)]">
          {item.title}
          {item.isDraft && (
            <span className="ml-2 text-xs text-[var(--vela-fg-muted)]">borrador</span>
          )}
        </span>
        <span className="text-xs text-[var(--vela-fg-muted)]">
          {item.ref} · {INTEGRATION_REASON_LABELS[item.reason]}
        </span>
      </button>
    </li>
  );
}

import { useEffect, useState } from 'react';
import { PULL_REQUEST_REASON_LABELS, type PullRequestSummary } from '@vela/shared';
import { useIntegrationsStore } from '../../../stores/integrationsStore';
import { writeToClipboard } from '../../../lib/clipboard';

export function Integrations() {
  const { status, devicePrompt, busy, hydrate } = useIntegrationsStore();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h2 className="text-base font-semibold text-[var(--vela-fg)]">GitHub</h2>
        <p className="text-sm text-[var(--vela-fg-muted)]">
          Vela consulta cada dos minutos las pull requests que te afectan —las tuyas, las
          que te han pedido revisar y aquellas en las que te han mencionado o comentado— y
          te avisa cuando hay movimiento.
        </p>
      </header>

      {status.phase === 'connected' && status.account ? (
        <ConnectedView />
      ) : devicePrompt ? (
        <DeviceCodeView />
      ) : (
        <ConnectView busy={busy} error={status.error} />
      )}
    </div>
  );
}

// ── Sin conectar ───────────────────────────────────────────────────────────

function ConnectView({ busy, error }: { busy: boolean; error: string | null }) {
  const startDeviceFlow = useIntegrationsStore((s) => s.startDeviceFlow);
  const connectToken = useIntegrationsStore((s) => s.connectToken);
  const setClientId = useIntegrationsStore((s) => s.setClientId);

  const [token, setToken] = useState('');
  const [clientId, setClientIdValue] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const handleToken = async () => {
    setTokenError(null);
    const message = await connectToken(token.trim());
    if (message) setTokenError(message);
    else setToken('');
  };

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-md border border-[var(--vela-danger,#e5534b)] bg-[var(--vela-bg-surface)] px-3 py-2 text-sm text-[var(--vela-fg)]">
          {error}
        </p>
      )}

      <section className="space-y-3 rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] p-5">
        <h3 className="text-sm font-semibold text-[var(--vela-fg)]">
          Iniciar sesión con tu cuenta
        </h3>
        <p className="text-sm text-[var(--vela-fg-muted)]">
          Vela te dará un código y lo autorizas en github.com. Pide permiso de lectura
          sobre tus repositorios y tus avisos: con menos que eso GitHub no deja ver las
          pull requests privadas ni clasificar qué ha pasado en cada una.
        </p>
        <button
          onClick={() => void startDeviceFlow()}
          disabled={busy}
          className="rounded-md bg-[var(--vela-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Conectando…' : 'Conectar con GitHub'}
        </button>
      </section>

      <section className="space-y-3 rounded-lg border border-[var(--vela-border)] p-5">
        <h3 className="text-sm font-semibold text-[var(--vela-fg)]">
          O pegar un token de acceso personal
        </h3>
        <p className="text-sm text-[var(--vela-fg-muted)]">
          Si prefieres dar el permiso mínimo, crea un token{' '}
          <em>fine-grained</em> con <code>Pull requests: read</code> solo en los
          repositorios que te interesen. A cambio, GitHub no permite leer el buzón de
          avisos con esos tokens: sabrás que la pull request se ha movido, pero no siempre
          qué ha pasado en ella.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="github_pat_…"
            className="flex-1 rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg)] px-3 py-2 text-sm text-[var(--vela-fg)]"
          />
          <button
            onClick={() => void handleToken()}
            disabled={busy || token.trim().length < 8}
            className="rounded-md border border-[var(--vela-border)] px-4 py-2 text-sm text-[var(--vela-fg)] disabled:opacity-50"
          >
            Conectar
          </button>
        </div>
        {tokenError && (
          <p className="text-sm text-[var(--vela-danger,#e5534b)]">{tokenError}</p>
        )}
      </section>

      <section>
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
                placeholder="Iv1.xxxxxxxxxxxxxxxx"
                className="flex-1 rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg)] px-3 py-2 text-sm text-[var(--vela-fg)]"
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
      </section>
    </div>
  );
}

// ── Esperando a que el usuario autorice ────────────────────────────────────

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
    <section className="space-y-4 rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] p-6">
      <h3 className="text-sm font-semibold text-[var(--vela-fg)]">
        Autoriza Vela en GitHub
      </h3>
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
    </section>
  );
}

// ── Conectado ──────────────────────────────────────────────────────────────

function ConnectedView() {
  const { status, busy, checkNow, disconnect, setEnabled, openPr } = useIntegrationsStore();
  const account = status.account;
  if (!account) return null;

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] p-5">
        <div>
          <p className="text-sm font-medium text-[var(--vela-fg)]">
            Conectado como <strong>{account.login}</strong>
          </p>
          <p className="mt-1 text-xs text-[var(--vela-fg-muted)]">
            {account.authMethod === 'device-flow'
              ? 'Sesión autorizada desde este equipo'
              : 'Token de acceso personal'}
            {account.hasInbox
              ? ' · avisos detallados'
              : ' · sin buzón: los avisos no distinguen el motivo'}
          </p>
        </div>
        <button
          onClick={() => void disconnect()}
          className="rounded-md border border-[var(--vela-border)] px-3 py-2 text-sm text-[var(--vela-fg)]"
        >
          Desconectar
        </button>
      </section>

      <label className="flex items-center gap-3 text-sm text-[var(--vela-fg)]">
        <input
          type="checkbox"
          checked={status.enabled}
          onChange={(e) => void setEnabled(e.target.checked)}
        />
        Avisarme de las pull requests que me afectan
      </label>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--vela-fg)]">
            Te esperan {status.pending.length}
          </h3>
          <button
            onClick={() => void checkNow()}
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
          <p className="text-sm text-[var(--vela-fg-muted)]">
            Nada pendiente ahora mismo.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--vela-border)] rounded-lg border border-[var(--vela-border)]">
            {status.pending.map((pr) => (
              <PrRow key={pr.id} pr={pr} onOpen={() => void openPr(pr.url)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PrRow({ pr, onOpen }: { pr: PullRequestSummary; onOpen: () => void }) {
  return (
    <li>
      <button
        onClick={onOpen}
        className="flex w-full flex-col items-start gap-1 px-4 py-3 text-left hover:bg-[var(--vela-bg-surface)]"
      >
        <span className="text-sm text-[var(--vela-fg)]">
          {pr.title}
          {pr.isDraft && (
            <span className="ml-2 text-xs text-[var(--vela-fg-muted)]">borrador</span>
          )}
        </span>
        <span className="text-xs text-[var(--vela-fg-muted)]">
          {pr.repo}#{pr.number} · {PULL_REQUEST_REASON_LABELS[pr.reason]}
        </span>
      </button>
    </li>
  );
}

import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useSyncStore } from '../../../stores/syncStore';
import { useSettings } from '../lib/useSettings';
import type { DeviceInfo } from '@vela/shared';

export function Sync() {
  const { uiStep, hydrate } = useSyncStore();
  const settings = useSettings();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (uiStep === 'idle') return <SyncNotConfigured />;
  if (uiStep === 'email' || uiStep === 'waiting-click') return <SyncEmailStep />;
  if (uiStep === 'password') return <SyncPasswordStep />;
  if (uiStep === 'active') return <SyncActiveView settings={settings} />;

  return null;
}

// ── Estado 1: No configurado ───────────────────────────────────────────────

function SyncNotConfigured() {
  const setUiStep = useSyncStore((s) => s.setUiStep);

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <span className="text-[64px] leading-none text-[var(--vela-accent)]">☁</span>
        <h2 className="text-lg font-semibold text-[var(--vela-fg)]">
          Sincroniza Vela entre tus dispositivos
        </h2>
        <p className="max-w-md text-sm text-[var(--vela-fg-muted)]">
          Mantén tus datos al día en todos tus dispositivos con cifrado de extremo a extremo.
          Ni siquiera el servidor puede leer tu información.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6 rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] p-6">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--vela-accent)]">
            ✓ Se sincroniza
          </p>
          <ul className="space-y-2 text-sm text-[var(--vela-fg)]">
            <li>Workspaces y pestañas</li>
            <li>
              <span>Anclas</span>
              <span className="ml-1.5 text-xs text-[var(--vela-fg-muted)]">· Pestañas ancladas globalmente</span>
            </li>
            <li>
              <span>Cargas</span>
              <span className="ml-1.5 text-xs text-[var(--vela-fg-muted)]">· Pestañas ancladas por workspace</span>
            </li>
            <li>Gestor de contraseñas</li>
            <li>Scripts de usuario</li>
            <li>Notas rápidas</li>
            <li>Configuración del perfil</li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--vela-fg-muted)]">
            ✗ No se sincroniza
          </p>
          <ul className="space-y-1.5 text-sm text-[var(--vela-fg-muted)]">
            <li>Historial</li>
            <li>Extensiones</li>
            <li>Pestañas blindadas</li>
          </ul>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={() => setUiStep('email')}
          className="flex items-center gap-2 rounded-md bg-[var(--vela-accent)] px-6 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          ☁ Activar sincronización
        </button>
        <p className="text-xs text-[var(--vela-fg-muted)]">
          La sincronización es opcional y gratuita. Vela funciona perfectamente sin ella.
        </p>
      </div>
    </div>
  );
}

// ── Estado 2: Introducir email / Esperando click ───────────────────────────

function SyncEmailStep() {
  const { uiStep, setUiStep, requestMagicLink } = useSyncStore();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendTimer, setResendTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startResendTimer() {
    setResendTimer(30);
    timerRef.current = setInterval(() => {
      setResendTimer((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function handleSend() {
    if (!email.includes('@')) { setError('Introduce un email válido.'); return; }
    setSending(true);
    setError(null);
    try {
      await requestMagicLink(email);
      setUiStep('waiting-click');
      startResendTimer();
    } catch {
      setError('No se pudo enviar el email. Inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  }

  async function handleResend() {
    if (resendTimer > 0) return;
    setSending(true);
    try {
      await requestMagicLink(email);
      startResendTimer();
    } catch {
      setError('No se pudo reenviar el email.');
    } finally {
      setSending(false);
    }
  }

  if (uiStep === 'waiting-click') {
    return (
      <div className="flex flex-col items-center gap-6 py-8 text-center">
        <span className="text-5xl">📬</span>
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-[var(--vela-fg)]">Revisa tu bandeja de entrada</h2>
          <p className="text-sm text-[var(--vela-fg-muted)]">
            Haz click en el enlace del email para continuar.
          </p>
          <p className="text-xs text-[var(--vela-fg-muted)]">Esta pantalla se actualiza automáticamente.</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={resendTimer > 0 || sending}
            onClick={() => void handleResend()}
            className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-elevated)] px-4 py-2 text-sm text-[var(--vela-fg)] transition-colors hover:bg-[var(--vela-hover)] disabled:opacity-50"
          >
            {resendTimer > 0 ? `Reenviar email (${resendTimer}s)` : 'Reenviar email'}
          </button>
          <button
            type="button"
            onClick={() => setUiStep('idle')}
            className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-elevated)] px-4 py-2 text-sm text-[var(--vela-fg)] transition-colors hover:bg-[var(--vela-hover)]"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-4">
      <div>
        <h2 className="mb-1 text-base font-semibold text-[var(--vela-fg)]">Activar sincronización</h2>
        <p className="text-sm text-[var(--vela-fg-muted)]">
          Introduce tu email para recibir un enlace de acceso. Sin contraseñas de cuenta.
        </p>
      </div>
      <div className="space-y-3">
        <input
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSend(); }}
          placeholder="tu@email.com"
          className="w-full rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-3 py-2 text-sm text-[var(--vela-fg)] placeholder:text-[var(--vela-fg-muted)] outline-none focus:border-[var(--vela-accent)]"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={sending}
          onClick={() => void handleSend()}
          className="rounded-md bg-[var(--vela-accent)] px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {sending ? 'Enviando…' : 'Enviar enlace'}
        </button>
        <button
          type="button"
          onClick={() => setUiStep('idle')}
          className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-elevated)] px-4 py-2 text-sm text-[var(--vela-fg)] transition-colors hover:bg-[var(--vela-hover)]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Estado 3: Contraseña de sincronización ────────────────────────────────

function strengthLabel(pw: string): { label: string; color: string } {
  if (pw.length < 8) return { label: 'Demasiado corta', color: 'text-red-500' };
  const score = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length;
  if (score <= 2) return { label: 'Débil', color: 'text-orange-500' };
  if (score === 3) return { label: 'Media', color: 'text-yellow-500' };
  return { label: 'Fuerte', color: 'text-green-500' };
}

function SyncPasswordStep() {
  const { pendingToken, setupSync, setUiStep, setRecentPassword, status } = useSyncStore();
  const isFirstTime = !status.configured;

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = strengthLabel(password);
  const isValid = isFirstTime
    ? password.length >= 8 && password === confirm
    : password.length >= 8;

  async function handleActivate() {
    if (!pendingToken) { setError('Token no disponible. Vuelve a empezar.'); return; }
    setConnecting(true);
    setError(null);
    // Guardar la contraseña en el store ANTES de llamar a setupSync,
    // para que esté disponible en el modal de Recovery Card.
    setRecentPassword(password);
    const ok = await setupSync(pendingToken, password);
    if (!ok) {
      setRecentPassword(null);
      setError('Contraseña incorrecta. Inténtalo de nuevo.');
      setConnecting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 py-4">
      <div>
        <h2 className="mb-1 text-base font-semibold text-[var(--vela-fg)]">
          {isFirstTime ? 'Crea tu contraseña de sincronización' : 'Introduce tu contraseña de sincronización'}
        </h2>
        <p className="text-sm text-[var(--vela-fg-muted)]">
          {isFirstTime
            ? 'Esta contraseña cifra todos tus datos antes de enviarlos. Ni siquiera el servidor puede leerlos.'
            : 'Es la misma contraseña que usaste al configurar el sync en tu primer dispositivo.'}
        </p>
      </div>

      {isFirstTime && (
        <div className="flex items-start gap-2 rounded-md border border-orange-400/40 bg-orange-400/10 px-4 py-3">
          <span className="mt-0.5 text-orange-400">⚠</span>
          <p className="text-xs text-orange-400">
            Si pierdes esta contraseña, tus datos en el servidor son irrecuperables.
            Guarda la Recovery Card cuando la actives.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            className="w-full rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-3 py-2 pr-10 text-sm text-[var(--vela-fg)] placeholder:text-[var(--vela-fg-muted)] outline-none focus:border-[var(--vela-accent)]"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)]"
          >
            {showPw ? '🙈' : '👁'}
          </button>
        </div>

        {password.length > 0 && (
          <p className={`text-xs ${strength.color}`}>Fortaleza: {strength.label}</p>
        )}

        {isFirstTime && (
          <input
            type={showPw ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirmar contraseña"
            className="w-full rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-3 py-2 text-sm text-[var(--vela-fg)] placeholder:text-[var(--vela-fg-muted)] outline-none focus:border-[var(--vela-accent)]"
          />
        )}

        {isFirstTime && confirm.length > 0 && password !== confirm && (
          <p className="text-xs text-red-500">Las contraseñas no coinciden.</p>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          disabled={!isValid || connecting}
          onClick={() => void handleActivate()}
          className="rounded-md bg-[var(--vela-accent)] px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {connecting
            ? 'Conectando y descargando datos…'
            : isFirstTime ? 'Activar sincronización' : 'Conectar este dispositivo'}
        </button>
        <button
          type="button"
          onClick={() => { setRecentPassword(null); setUiStep('idle'); }}
          className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-elevated)] px-4 py-2 text-sm text-[var(--vela-fg)] transition-colors hover:bg-[var(--vela-hover)]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Estado 4: Sync activo ──────────────────────────────────────────────────

function relativeTime(ts: number | null): string {
  if (ts === null) return 'Nunca';
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Hace un momento';
  if (minutes < 60) return `Hace ${minutes} minuto${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} hora${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} día${days === 1 ? '' : 's'}`;
}

interface SyncActiveProps {
  settings: ReturnType<typeof useSettings>;
}

function SyncActiveView({ settings }: SyncActiveProps) {
  const { status, syncNow, getDevices, disconnectDevice, deactivate, setRecentPassword, recentPassword } = useSyncStore();
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loadingSync, setLoadingSync] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [lastSyncLabel, setLastSyncLabel] = useState(() => relativeTime(status.lastSyncAt));
  const [showRecovery, setShowRecovery] = useState(false);

  const recoveryCardSaved = settings.get<boolean>('sync:recovery-card-saved', false);

  useEffect(() => {
    void getDevices().then(setDevices);
    // Mostrar recovery card si hay contraseña reciente (primera activación)
    if (recentPassword && !recoveryCardSaved) {
      setShowRecovery(true);
    }
  }, [getDevices, recentPassword, recoveryCardSaved]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLastSyncLabel(relativeTime(status.lastSyncAt));
    }, 60_000);
    return () => clearInterval(interval);
  }, [status.lastSyncAt]);

  async function handleSyncNow() {
    setLoadingSync(true);
    try { await syncNow(); } finally { setLoadingSync(false); }
  }

  async function handleDeactivate() {
    await deactivate();
    setConfirmDeactivate(false);
  }

  async function handleDisconnect(suffix: string) {
    await disconnectDevice(suffix);
    setDevices(await getDevices());
  }

  function handleRecoveryClose() {
    void settings.set('sync:recovery-card-saved', true);
    setRecentPassword(null);
    setShowRecovery(false);
  }

  return (
    <div className="space-y-6">
      {showRecovery && recentPassword && (
        <RecoveryCardModal password={recentPassword} onClose={handleRecoveryClose} />
      )}

      <div className="flex items-center gap-3">
        <span className="text-2xl text-[var(--vela-accent)]">☁</span>
        <div>
          <h2 className="text-base font-semibold text-[var(--vela-fg)]">Sincronización activa</h2>
          <span className="flex items-center gap-1.5 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${status.connected ? 'bg-green-500' : 'bg-gray-400'}`}
            />
            <span className="text-[var(--vela-fg-muted)]">
              {status.connected ? 'Conectado' : 'Sin conexión'}
            </span>
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] p-4 text-sm text-[var(--vela-fg-muted)]">
        Última sync: <span className="text-[var(--vela-fg)]">{lastSyncLabel}</span>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-[var(--vela-fg)]">Dispositivos conectados</h3>
        <div className="space-y-1 rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] divide-y divide-[var(--vela-border)]">
          {devices.map((device) => (
            <div key={device.tokenSuffix} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[var(--vela-fg-muted)]">🖥</span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-[var(--vela-fg)]">
                    {device.userAgent || `Dispositivo …${device.tokenSuffix}`}
                    {device.isCurrent && (
                      <span className="ml-2 rounded bg-[var(--vela-accent)]/15 px-1.5 py-0.5 text-xs text-[var(--vela-accent)]">
                        Este dispositivo
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--vela-fg-muted)]">{relativeTime(device.lastSeenAt)}</p>
                </div>
              </div>
              {!device.isCurrent && (
                <button
                  type="button"
                  onClick={() => void handleDisconnect(device.tokenSuffix)}
                  className="shrink-0 rounded-md border border-red-500/30 px-3 py-1 text-xs text-red-500 transition-colors hover:bg-red-500/10"
                >
                  Desconectar
                </button>
              )}
            </div>
          ))}
          {devices.length === 0 && (
            <p className="px-4 py-3 text-xs text-[var(--vela-fg-muted)]">Cargando dispositivos…</p>
          )}
        </div>
      </section>

      <section className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={loadingSync || status.syncInProgress}
          onClick={() => void handleSyncNow()}
          className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-elevated)] px-4 py-2 text-sm text-[var(--vela-fg)] transition-colors hover:bg-[var(--vela-hover)] disabled:opacity-50"
        >
          {loadingSync || status.syncInProgress ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>

        {recoveryCardSaved === false || recentPassword ? (
          <button
            type="button"
            onClick={() => setShowRecovery(true)}
            className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-elevated)] px-4 py-2 text-sm text-[var(--vela-fg)] transition-colors hover:bg-[var(--vela-hover)]"
          >
            Ver Recovery Card
          </button>
        ) : null}

        {!confirmDeactivate ? (
          <button
            type="button"
            onClick={() => setConfirmDeactivate(true)}
            className="rounded-md border border-red-500/30 px-4 py-2 text-sm text-red-500 transition-colors hover:bg-red-500/10"
          >
            Desactivar sincronización
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-2">
            <p className="text-xs text-[var(--vela-fg-muted)]">
              ¿Desactivar sync? Tus datos locales se mantienen.
            </p>
            <button
              type="button"
              onClick={() => void handleDeactivate()}
              className="rounded-md bg-red-500 px-3 py-1 text-xs font-medium text-white"
            >
              Desactivar
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeactivate(false)}
              className="rounded-md border border-[var(--vela-border)] px-3 py-1 text-xs text-[var(--vela-fg)]"
            >
              Cancelar
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Recovery Card Modal ────────────────────────────────────────────────────

interface RecoveryCardProps {
  password: string;
  onClose: () => void;
}

function RecoveryCardModal({ password, onClose }: RecoveryCardProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyTimer, setCopyTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dateStr = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

  function handleCopyPassword() {
    void navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      let count = 30;
      setCopyTimer(count);
      timerRef.current = setInterval(() => {
        count -= 1;
        setCopyTimer(count);
        if (count <= 0) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          void navigator.clipboard.writeText('').catch(() => {});
          setCopied(false);
        }
      }, 1000);
    });
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  async function handleDownloadPdf() {
    try {
      await window.api.recoveryCard.downloadPdf({ email: '', date: dateStr });
    } catch {
      // silenciar: el PDF es opcional
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    >
      <div className="mx-4 w-full max-w-md rounded-xl border border-[var(--vela-border)] bg-[var(--vela-bg-app)] p-6 shadow-2xl">
        <h2 className="mb-1 text-base font-semibold text-[var(--vela-fg)]">
          Guarda tu Recovery Card
        </h2>
        <p className="mb-5 text-sm text-[var(--vela-fg-muted)]">
          Sin ella no podrás recuperar tus datos si olvidas la contraseña de sincronización.
        </p>

        {/* Tarjeta visual — fondo claro para imprimir */}
        <div className="mb-5 rounded-lg border-2 border-gray-300 bg-white p-5 text-gray-800">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xl">⚓</span>
            <span className="font-bold text-sm">VELA SYNC — RECOVERY CARD</span>
          </div>
          <div className="space-y-1 text-sm font-mono">
            <p className="flex items-center gap-2">
              <span className="font-semibold">Contraseña:</span>
              <span>{showPassword ? password : '•'.repeat(Math.min(password.length, 16))}</span>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="ml-1 text-xs underline text-blue-600"
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </p>
            <p><span className="font-semibold">Fecha:</span> {dateStr}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void handleDownloadPdf()}
            className="w-full rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-elevated)] px-4 py-2 text-sm text-[var(--vela-fg)] transition-colors hover:bg-[var(--vela-hover)]"
          >
            Descargar como PDF
          </button>
          <button
            type="button"
            onClick={handleCopyPassword}
            disabled={copied}
            className="w-full rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-elevated)] px-4 py-2 text-sm text-[var(--vela-fg)] transition-colors hover:bg-[var(--vela-hover)] disabled:opacity-70"
          >
            {copied ? `Copiada (se borrará en ${copyTimer}s)` : 'Copiar contraseña'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md bg-[var(--vela-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            He guardado mi Recovery Card
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}

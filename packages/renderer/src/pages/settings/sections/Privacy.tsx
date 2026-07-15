import { useEffect, useState } from 'react';
import type { useSettings } from '../lib/useSettings';
import { SettingRow, SettingSection } from '../components/SettingRow';
import { Toggle } from '../components/controls/Toggle';
import { Slider } from '../components/controls/Slider';
import { Select, type SelectOption } from '../components/controls/Select';
import { useMediaPermissionStore } from '../../../stores/mediaPermissionStore';
import { useClientCertStore } from '../../../stores/clientCertStore';

type DohProvider = 'cloudflare' | 'google' | 'quad9';
type ClearRange  = 'hour' | 'day' | 'week' | 'all';
type HistoryRetention = 'week' | 'month' | '3months' | '6months' | 'forever';
type NotificationDisplayMode = 'os-and-panel' | 'os-only' | 'panel-only';

const NOTIFICATION_DISPLAY_MODE_OPTIONS: SelectOption<NotificationDisplayMode>[] = [
  { value: 'os-and-panel', label: 'Sistema y panel (ambos)' },
  { value: 'panel-only',   label: 'Solo panel de Vela' },
  { value: 'os-only',      label: 'Solo notificaciones del sistema' },
];

const HISTORY_RETENTION_OPTIONS: SelectOption<string>[] = [
  { value: 'week',     label: '1 semana' },
  { value: 'month',    label: '1 mes' },
  { value: '3months',  label: '3 meses' },
  { value: '6months',  label: '6 meses' },
  { value: 'forever',  label: 'Siempre' },
];

const DOH_PROVIDERS: SelectOption<DohProvider>[] = [
  { value: 'cloudflare', label: 'Cloudflare (1.1.1.1)' },
  { value: 'google',     label: 'Google (8.8.8.8)' },
  { value: 'quad9',      label: 'Quad9 (9.9.9.9)' },
];

interface Props {
  settings: ReturnType<typeof useSettings>;
}

export function Privacy({ settings }: Props) {
  const { get, set } = settings;
  const dohEnabled = get<boolean>('privacy:dns-over-https', false);

  return (
    <>
      <SettingSection title="Notificaciones">
        <SettingRow
          label="Dónde mostrar las notificaciones"
          description="Controla si las notificaciones entrantes se almacenan en el panel de Vela, se muestran como notificaciones del sistema operativo o ambas."
        >
          <Select<NotificationDisplayMode>
            value={get<NotificationDisplayMode>('notifications:display-mode', 'os-and-panel')}
            options={NOTIFICATION_DISPLAY_MODE_OPTIONS}
            onChange={(v) => void set('notifications:display-mode', v)}
          />
        </SettingRow>
        <div className="px-4 py-2">
          <button
            onClick={() => void window.api.notifications.openCenter()}
            className="text-xs text-[var(--vela-accent)] hover:underline"
          >
            Abrir centro de notificaciones →
          </button>
        </div>
      </SettingSection>

      <MediaPermissionsSection />

      <ClientCertificatesSection />

      <SettingSection title="Cookies y rastreo">
        <SettingRow
          label="Bloquear cookies de terceros"
          description="Impide que los sitios web rastreen tu actividad entre páginas."
        >
          <Toggle
            value={get<boolean>('privacy:block-third-party-cookies', false)}
            onChange={(v) => void set('privacy:block-third-party-cookies', v)}
          />
        </SettingRow>
        <SettingRow
          label="Enviar señal Do Not Track"
          description="Solicita a los sitios que no rastreen tu actividad (no obligatorio)."
        >
          <Toggle
            value={get<boolean>('privacy:do-not-track', false)}
            onChange={(v) => void set('privacy:do-not-track', v)}
          />
        </SettingRow>
        <div className="px-4 py-2 text-xs text-[var(--vela-fg-muted)]">
          Para gestionar las cookies de una página específica, usa el icono 🍪 en la barra de direcciones mientras navegas por ese sitio.
        </div>
        <div className="px-4 py-2">
          <ClearAllCookiesButton />
        </div>
      </SettingSection>

      <SettingSection title="DNS cifrado">
        <SettingRow
          label="Usar DNS over HTTPS"
          description="Cifra las consultas DNS para mayor privacidad."
        >
          <Toggle
            value={dohEnabled}
            onChange={(v) => void set('privacy:dns-over-https', v)}
          />
        </SettingRow>
        {dohEnabled && (
          <SettingRow label="Proveedor DoH">
            <Select<DohProvider>
              value={get<DohProvider>('privacy:doh-provider', 'cloudflare')}
              options={DOH_PROVIDERS}
              onChange={(v) => void set('privacy:doh-provider', v)}
            />
          </SettingRow>
        )}
      </SettingSection>

      <SettingSection title="Historial de navegación">
        <SettingRow
          label="Registrar historial de navegación"
          description="Si se desactiva, las páginas visitadas no se guardan. Las entradas ya existentes permanecen."
        >
          <Toggle
            value={get<boolean>('history:enabled', true)}
            onChange={(v) => void set('history:enabled', v)}
          />
        </SettingRow>
        <SettingRow
          label="Conservar historial durante"
          description="Las entradas más antiguas se eliminan automáticamente cada día."
        >
          <Select<string>
            value={get<string>('history:retention', 'forever')}
            options={HISTORY_RETENTION_OPTIONS}
            onChange={(v) => void set('history:retention', v)}
          />
        </SettingRow>
        <div className="px-4 py-2">
          <button
            onClick={() => void window.api.commands.execute('internal.openHistory')}
            className="text-xs text-[var(--vela-accent)] hover:underline"
          >
            Ver historial completo →
          </button>
        </div>
      </SettingSection>

      <SettingSection title="Historial y caché">
        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
          <ClearDataButton />
          <QuickClearCacheButton />
        </div>
      </SettingSection>

      <SettingSection title="Snapshots de bug">
        <SettingRow
          label="Incluir peticiones de red en el snapshot"
          description="Añade un resumen de las últimas 50 peticiones de red al archivo .zip del snapshot."
        >
          <Toggle
            value={get<boolean>('bug-snapshot:include-network', true)}
            onChange={(v) => void set('bug-snapshot:include-network', v)}
          />
        </SettingRow>
        <div className="px-4 py-2 text-xs text-[var(--vela-fg-muted)]">
          El snapshot se guarda solo en tu equipo. No se envía a ningún servidor.
        </div>
      </SettingSection>

      <SettingSection title="Archivos recientes">
        <SettingRow
          label="Usar selector de archivos mejorado de Vela"
          description="Muestra archivos recientes y del portapapeles al hacer clic en un selector de archivos."
        >
          <Toggle
            value={get<boolean>('filepicker:enabled', true)}
            onChange={(v) => void set('filepicker:enabled', v)}
          />
        </SettingRow>
        <SettingRow
          label="Archivos recientes a mostrar"
          description="Número máximo de archivos en el historial del selector."
        >
          <Slider
            min={5}
            max={20}
            step={1}
            value={get<number>('filepicker:recent-limit', 10)}
            onChange={(v) => void set('filepicker:recent-limit', v)}
          />
        </SettingRow>
        <div className="px-4 py-2">
          <ClearRecentFilesButton />
        </div>
      </SettingSection>
    </>
  );
}

// ─── Media permissions section ───────────────────────────────────────────────

function MediaPermissionsSection() {
  const permissions = useMediaPermissionStore((s) => s.permissions);
  const revoke = useMediaPermissionStore((s) => s.revoke);

  useEffect(() => {
    void useMediaPermissionStore.getState().hydrate();
  }, []);

  const granted = permissions.filter((p) => p.state === 'granted');
  const denied = permissions.filter((p) => p.state === 'denied');

  if (permissions.length === 0) {
    return (
      <SettingSection title="Cámara y micrófono">
        <div className="px-4 py-3 text-xs text-[var(--vela-fg-muted)]">
          Ningún sitio ha solicitado acceso a la cámara o micrófono.
        </div>
      </SettingSection>
    );
  }

  return (
    <SettingSection title="Cámara y micrófono">
      {granted.length > 0 && (
        <div className="flex flex-col gap-1 px-4 py-2">
          <p className="text-xs font-medium text-[var(--vela-fg-muted)] uppercase tracking-wide mb-1">Permitidos</p>
          {granted.map((p) => (
            <div key={p.origin} className="flex items-center justify-between gap-2 rounded-md px-3 py-2 hover:bg-[var(--vela-bg-row-hover)]">
              <span className="text-xs text-[var(--vela-fg)] truncate">{(() => { try { return new URL(p.origin).hostname; } catch { return p.origin; } })()}</span>
              <button
                onClick={() => void revoke(p.origin)}
                className="shrink-0 rounded px-2 py-0.5 text-xs text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50"
              >
                Revocar
              </button>
            </div>
          ))}
        </div>
      )}
      {denied.length > 0 && (
        <div className="flex flex-col gap-1 px-4 py-2">
          <p className="text-xs font-medium text-[var(--vela-fg-muted)] uppercase tracking-wide mb-1">Denegados</p>
          {denied.map((p) => (
            <div key={p.origin} className="flex items-center justify-between gap-2 rounded-md px-3 py-2 hover:bg-[var(--vela-bg-row-hover)]">
              <span className="text-xs text-[var(--vela-fg-muted)] truncate">{(() => { try { return new URL(p.origin).hostname; } catch { return p.origin; } })()}</span>
              <button
                onClick={() => void revoke(p.origin)}
                className="shrink-0 rounded px-2 py-0.5 text-xs text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      )}
    </SettingSection>
  );
}

// ─── Certificados cliente recordados (mTLS) ──────────────────────────────────

function ClientCertificatesSection() {
  const choices = useClientCertStore((s) => s.choices);
  const forget = useClientCertStore((s) => s.forget);

  useEffect(() => {
    void useClientCertStore.getState().hydrate();
  }, []);

  if (choices.length === 0) {
    return (
      <SettingSection title="Certificados cliente recordados">
        <div className="px-4 py-3 text-xs text-[var(--vela-fg-muted)]">
          Ningún sitio tiene un certificado de identificación recordado. Al elegir un
          certificado para autenticarte en un sitio (sede electrónica, banca…) puedes
          marcar &quot;Recordar esta elección&quot; para no volver a elegirlo cada vez.
        </div>
      </SettingSection>
    );
  }

  return (
    <SettingSection title="Certificados cliente recordados">
      <div className="flex flex-col gap-1 px-4 py-2">
        {choices.map((c) => (
          <div key={c.origin} className="flex items-center justify-between gap-2 rounded-md px-3 py-2 hover:bg-[var(--vela-bg-row-hover)]">
            <div className="min-w-0">
              <p className="text-xs text-[var(--vela-fg)] truncate">{(() => { try { return new URL(c.origin).hostname; } catch { return c.origin; } })()}</p>
              <p className="text-[11px] text-[var(--vela-fg-muted)] truncate">{c.subject}</p>
            </div>
            <button
              onClick={() => void forget(c.origin)}
              className="shrink-0 rounded px-2 py-0.5 text-xs text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50"
            >
              Olvidar
            </button>
          </div>
        ))}
      </div>
    </SettingSection>
  );
}

// ─── Clear data button (modal) ────────────────────────────────────────────────

type ClearStep = 'idle' | 'open' | 'loading' | 'done';

const RANGE_OPTIONS: SelectOption<ClearRange>[] = [
  { value: 'hour', label: 'Última hora' },
  { value: 'day',  label: 'Últimas 24 h' },
  { value: 'week', label: 'Última semana' },
  { value: 'all',  label: 'Todo' },
];

const DATA_ITEMS = [
  { id: 'history',    label: 'Historial' },
  { id: 'cookies',   label: 'Cookies' },
  { id: 'cache',     label: 'Caché' },
  { id: 'forms',     label: 'Datos de formularios' },
  { id: 'passwords', label: 'Contraseñas guardadas' },
  { id: 'site-data', label: 'Datos de sitios' },
] as const;

type DataItemId = typeof DATA_ITEMS[number]['id'];

function ClearDataButton() {
  const [step, setStep] = useState<ClearStep>('idle');
  const [range, setRange] = useState<ClearRange>('all');
  const [selected, setSelected] = useState<Set<DataItemId>>(
    new Set(['history', 'cookies', 'cache', 'forms', 'passwords', 'site-data']),
  );

  function toggle(id: DataItemId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleClear() {
    setStep('loading');
    try {
      await window.api.profile.clearData();
      setStep('done');
      setTimeout(() => setStep('idle'), 3000);
    } catch {
      setStep('idle');
    }
  }

  if (step === 'idle') {
    return (
      <button
        onClick={() => setStep('open')}
        className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-3 py-1.5 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50"
      >
        Limpiar datos de navegación…
      </button>
    );
  }

  if (step === 'done') {
    return (
      <span className="text-sm text-[var(--vela-fg-muted)]">Datos eliminados ✓</span>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={() => setStep('idle')}
    >
      <div
        className="w-[420px] rounded-lg p-6 shadow-2xl"
        style={{ background: 'var(--vela-bg-sidebar-elev)', border: '1px solid var(--vela-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-base font-semibold text-[var(--vela-fg)]">
          Limpiar datos de navegación
        </h3>

        <div className="mb-4 flex flex-col gap-2">
          {DATA_ITEMS.map(({ id, label }) => (
            <label key={id} className="flex items-center gap-2.5 text-sm text-[var(--vela-fg)] cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(id)}
                onChange={() => toggle(id)}
                className="accent-[var(--vela-accent)]"
              />
              {label}
            </label>
          ))}
        </div>

        <div className="mb-5 flex items-center gap-2">
          <span className="text-sm text-[var(--vela-fg-muted)]">Rango temporal:</span>
          <Select<ClearRange>
            value={range}
            options={RANGE_OPTIONS}
            onChange={setRange}
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={() => setStep('idle')}
            disabled={step === 'loading'}
            className="rounded px-3 py-1.5 text-sm text-[var(--vela-fg-muted)] hover:bg-[var(--vela-border)]/50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleClear()}
            disabled={step === 'loading' || selected.size === 0}
            className="rounded bg-red-500/90 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {step === 'loading' ? 'Limpiando…' : 'Limpiar ahora'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Clear all cookies ────────────────────────────────────────────────────────

function ClearAllCookiesButton() {
  const [state, setState] = useState<'idle' | 'confirm' | 'loading' | 'done'>('idle');

  async function handleClear() {
    setState('loading');
    try {
      await window.api.cookies.clearAll();
      setState('done');
      setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('idle');
    }
  }

  if (state === 'idle') {
    return (
      <button
        onClick={() => setState('confirm')}
        className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-3 py-1.5 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50"
      >
        Limpiar todas las cookies del perfil…
      </button>
    );
  }

  if (state === 'confirm') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-[var(--vela-fg-muted)]">
          Se eliminarán todas las cookies de todos los sitios. Se cerrará sesión en todas las webs. ¿Continuar?
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => void handleClear()}
            className="rounded bg-red-500/90 px-3 py-1 text-xs font-medium text-white hover:bg-red-500"
          >
            Eliminar todas
          </button>
          <button
            onClick={() => setState('idle')}
            className="rounded px-3 py-1 text-xs text-[var(--vela-fg-muted)] hover:bg-[var(--vela-border)]/50"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  if (state === 'done') {
    return <span className="text-sm text-[var(--vela-fg-muted)]">Cookies eliminadas ✓</span>;
  }

  return <span className="text-sm text-[var(--vela-fg-muted)]">Limpiando…</span>;
}

// ─── Clear recent files ───────────────────────────────────────────────────────

function ClearRecentFilesButton() {
  const [state, setState] = useState<'idle' | 'confirm' | 'loading' | 'done'>('idle');

  async function handleClear() {
    setState('loading');
    try {
      const ctxRes = await window.api.context();
      if (ctxRes.ok) {
        await window.api.filepicker.clearRecent({ profileId: ctxRes.data.profileId });
      }
      setState('done');
      setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('idle');
    }
  }

  if (state === 'idle') {
    return (
      <button
        onClick={() => setState('confirm')}
        className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-3 py-1.5 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50"
      >
        Limpiar historial de archivos recientes…
      </button>
    );
  }

  if (state === 'confirm') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--vela-fg-muted)]">¿Eliminar todos los archivos recientes?</span>
        <button
          onClick={() => void handleClear()}
          className="rounded bg-red-500/90 px-3 py-1 text-xs font-medium text-white hover:bg-red-500"
        >
          Eliminar
        </button>
        <button
          onClick={() => setState('idle')}
          className="rounded px-3 py-1 text-xs text-[var(--vela-fg-muted)] hover:bg-[var(--vela-border)]/50"
        >
          Cancelar
        </button>
      </div>
    );
  }

  if (state === 'done') {
    return <span className="text-sm text-[var(--vela-fg-muted)]">Historial eliminado ✓</span>;
  }

  return <span className="text-sm text-[var(--vela-fg-muted)]">Limpiando…</span>;
}

// ─── Quick cache clear ────────────────────────────────────────────────────────

function QuickClearCacheButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');

  async function handle() {
    setState('loading');
    try {
      await window.api.profile.clearData();
      setState('done');
      setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('idle');
    }
  }

  return (
    <button
      onClick={() => void handle()}
      disabled={state !== 'idle'}
      className="rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-3 py-1.5 text-sm text-[var(--vela-fg)] hover:bg-[var(--vela-border)]/50 disabled:opacity-50"
    >
      {state === 'idle'    && 'Limpiar caché solamente'}
      {state === 'loading' && 'Limpiando…'}
      {state === 'done'    && 'Caché eliminada ✓'}
    </button>
  );
}

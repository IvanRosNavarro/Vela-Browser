import type { useSettings } from '../lib/useSettings';

type SettingsHook = ReturnType<typeof useSettings>;

interface Props {
  settings: SettingsHook;
}

export function Security({ settings }: Props) {
  const autofill = settings.get('vault:autofill-enabled', true) as boolean;

  return (
    <div className="space-y-8">
      <Group title="Gestor de contraseñas">
        <Row
          label="Autorrelleno de credenciales"
          description="Detecta formularios de login y ofrece rellenar tus credenciales guardadas automáticamente."
        >
          <Toggle
            checked={autofill}
            onChange={(v) => void settings.set('vault:autofill-enabled', v)}
          />
        </Row>

        <div className="pt-2">
          <button
            type="button"
            onClick={() => { void window.api.commands.execute('internal.openPasswords'); }}
            className="flex items-center gap-2 rounded-md border border-[var(--vela-border)] bg-[var(--vela-bg-elevated)] px-4 py-2 text-sm text-[var(--vela-fg)] transition-colors hover:bg-[var(--vela-hover)]"
          >
            <span>Abrir gestor de contraseñas</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>
          <p className="mt-2 text-xs text-[var(--vela-fg-muted)]">
            Gestiona, busca, genera y audita tus contraseñas guardadas.
          </p>
        </div>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-sm font-semibold text-[var(--vela-fg)]">{title}</h2>
      <div className="space-y-1 rounded-lg border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] divide-y divide-[var(--vela-border)]">
        {children}
      </div>
    </section>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[var(--vela-fg)]">{label}</p>
        {description && <p className="mt-0.5 text-xs text-[var(--vela-fg-muted)]">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors',
        checked ? 'bg-[var(--vela-accent)]' : 'bg-[var(--vela-border)]',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        ].join(' ')}
      />
    </button>
  );
}

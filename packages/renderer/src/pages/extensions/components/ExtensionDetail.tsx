import { useState, useCallback, type CSSProperties } from 'react';
import type { InstalledExtension } from '@vela/shared';
import { X, Globe, Puzzle, Copy, ExternalLink, Settings2, Trash2, Pin, Shield } from 'lucide-react';

interface Props {
  extension: InstalledExtension;
  onClose(): void;
  onUninstall(id: string): void;
  onOpenOptions(id: string): void;
  onToggle(enabled: boolean): Promise<void>;
  onSetPinned(pinned: boolean): Promise<void>;
  onSetSecureAllowed(allowed: boolean): Promise<void>;
}

// ── Human-readable permission names in Spanish ────────────────────────────────

const PERM_LABELS: Record<string, string> = {
  tabs: 'Leer el historial de pestañas',
  activeTab: 'Acceder a la pestaña activa',
  storage: 'Guardar datos de la extensión',
  notifications: 'Mostrar notificaciones',
  scripting: 'Ejecutar scripts en páginas web',
  bookmarks: 'Leer y modificar marcadores',
  history: 'Leer y modificar el historial',
  downloads: 'Gestionar descargas',
  declarativeNetRequest: 'Bloquear o modificar solicitudes de red',
  declarativeNetRequestWithHostAccess: 'Bloquear solicitudes con acceso por host',
  declarativeNetRequestFeedback: 'Feedback de solicitudes de red',
  webRequest: 'Interceptar solicitudes de red',
  webRequestBlocking: 'Bloquear solicitudes de red',
  contextMenus: 'Añadir opciones al menú contextual',
  cookies: 'Leer y modificar cookies',
  nativeMessaging: 'Comunicarse con aplicaciones nativas',
  clipboardRead: 'Leer el portapapeles',
  clipboardWrite: 'Escribir en el portapapeles',
  identity: 'Gestionar identidad y acceso',
  alarms: 'Programar tareas periódicas',
  idle: 'Detectar inactividad del sistema',
  management: 'Gestionar otras extensiones',
  webNavigation: 'Observar la navegación web',
  sessions: 'Acceder a sesiones recientes',
  topSites: 'Ver los sitios más visitados',
  pageCapture: 'Capturar páginas web completas',
  geolocation: 'Acceder a la ubicación',
  proxy: 'Configurar el proxy de red',
  offscreen: 'Crear documentos fuera de pantalla',
  sidePanel: 'Mostrar en el panel lateral',
  tts: 'Usar síntesis de voz',
  unlimitedStorage: 'Almacenamiento ilimitado',
  tabGroups: 'Gestionar grupos de pestañas',
  privacy: 'Configurar ajustes de privacidad',
  power: 'Controlar el estado de energía',
  system: 'Información del sistema',
};

function permLabel(perm: string): string {
  return PERM_LABELS[perm] ?? perm;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ExtensionDetail({ extension, onClose, onUninstall, onOpenOptions, onToggle, onSetPinned, onSetSecureAllowed }: Props) {
  const [toggling, setToggling] = useState(false);
  const [pinToggling, setPinToggling] = useState(false);
  const [secureToggling, setSecureToggling] = useState(false);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const [copied, setCopied] = useState(false);

  const pinnedToBar = extension.pinnedToBar ?? true;
  const allowedInSecureTabs = extension.allowedInSecureTabs ?? false;

  const handleToggle = useCallback(async () => {
    if (toggling) return;
    setToggling(true);
    try {
      await onToggle(!extension.enabled);
    } finally {
      setToggling(false);
    }
  }, [toggling, onToggle, extension.enabled]);

  const handleSetPinned = useCallback(async () => {
    if (pinToggling) return;
    setPinToggling(true);
    try {
      await onSetPinned(!pinnedToBar);
    } finally {
      setPinToggling(false);
    }
  }, [pinToggling, onSetPinned, pinnedToBar]);

  const handleSetSecureAllowed = useCallback(async () => {
    if (secureToggling) return;
    setSecureToggling(true);
    try {
      await onSetSecureAllowed(!allowedInSecureTabs);
    } finally {
      setSecureToggling(false);
    }
  }, [secureToggling, onSetSecureAllowed, allowedInSecureTabs]);

  const handleCopyId = useCallback(() => {
    void navigator.clipboard.writeText(extension.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [extension.id]);

  return (
    <aside style={{
      width: 380, flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid var(--vela-border)',
      background: 'var(--vela-surface-1, var(--vela-bg-app))',
      overflow: 'hidden',
    }}>

      {/* ── Header strip ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid var(--vela-border)',
        flexShrink: 0,
      }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--vela-fg)' }}>
          Detalles de la extensión
        </span>
        <button
          onClick={onClose}
          style={{
            width: 26, height: 26, borderRadius: 5, border: 'none', cursor: 'pointer',
            background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--vela-fg-muted)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-surface-2)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        >
          <X size={15} />
        </button>
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 24px' }}>

        {/* Identity block: icon + name + version + badges */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 18 }}>
          <div style={{ flexShrink: 0 }}>
            {extension.iconUrl ? (
              <img
                src={extension.iconUrl}
                alt=""
                width={56}
                height={56}
                style={{
                  borderRadius: 10, display: 'block', imageRendering: 'pixelated',
                  filter: extension.enabled ? 'none' : 'grayscale(0.8)',
                }}
                draggable={false}
              />
            ) : (
              <div style={{
                width: 56, height: 56, borderRadius: 10,
                background: 'var(--vela-surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Puzzle size={28} color="var(--vela-fg-muted)" />
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--vela-fg)', lineHeight: 1.3 }}>
              {extension.name}
            </p>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--vela-fg-muted)' }}>
              v{extension.version}
            </p>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <DtBadge
                label={`MV${extension.manifestVersion}`}
                accent={extension.manifestVersion === 3}
                amber={extension.manifestVersion !== 3}
              />
              {extension.bundled && <DtBadge label="Incluida" accent />}
            </div>
          </div>
        </div>

        {/* Toggle rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <ToggleRow
            label={extension.enabled ? 'Extensión activada' : 'Extensión desactivada'}
            description={extension.enabled ? 'Se ejecuta en todas las páginas' : 'No tiene efecto mientras esté inactiva'}
            enabled={extension.enabled}
            toggling={toggling}
            onToggle={handleToggle}
          />
          {extension.hasPopup && (
            <ToggleRow
              label="Fijar en la barra de título"
              description={pinnedToBar ? 'Icono visible en la barra de título' : 'Icono oculto en la barra de título'}
              icon={<Pin size={14} />}
              enabled={pinnedToBar}
              toggling={pinToggling}
              onToggle={handleSetPinned}
            />
          )}
          <ToggleRow
            label="Permitir en pestañas blindadas"
            description={allowedInSecureTabs ? 'Se ejecuta en tabs blindadas' : 'No se ejecuta en tabs blindadas'}
            icon={<Shield size={14} />}
            enabled={allowedInSecureTabs}
            toggling={secureToggling}
            onToggle={handleSetSecureAllowed}
          />
        </div>

        {/* Description */}
        {extension.description && (
          <Section title="Descripción">
            <p style={{ margin: 0, fontSize: 13, color: 'var(--vela-fg)', lineHeight: 1.6 }}>
              {extension.description}
            </p>
          </Section>
        )}

        {/* Info */}
        <Section title="Información">
          <InfoRow label="Versión" value={extension.version} />

          {/* ID with copy button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
            <span style={{ fontSize: 12, color: 'var(--vela-fg-muted)', flexShrink: 0, marginRight: 8, minWidth: 56 }}>ID</span>
            <span style={{
              flex: 1, fontSize: 11, fontFamily: 'monospace',
              color: 'var(--vela-fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {extension.id}
            </span>
            <button
              onClick={handleCopyId}
              title={copied ? '¡Copiado!' : 'Copiar ID'}
              style={{
                marginLeft: 6, flexShrink: 0,
                width: 22, height: 22, borderRadius: 4, border: 'none', cursor: 'pointer',
                background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: copied ? 'var(--vela-accent)' : 'var(--vela-fg-muted)',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-surface-2)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <Copy size={12} />
            </button>
          </div>

          <InfoRow label="Tipo" value={extension.manifestVersion === 3 ? 'Manifest V3' : 'Manifest V2'} />
        </Section>

        {/* Permissions */}
        {extension.permissions.length > 0 && (
          <Section title="Permisos">
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {extension.permissions.map((perm) => (
                <li key={perm} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{
                    flexShrink: 0, marginTop: 3,
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--vela-accent)',
                    display: 'inline-block',
                  }} />
                  <span style={{ fontSize: 13, color: 'var(--vela-fg)', lineHeight: 1.45 }}>
                    {permLabel(perm)}
                    {PERM_LABELS[perm] === undefined && (
                      <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)', marginLeft: 4 }}>({perm})</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Host permissions */}
        {extension.hostPermissions.length > 0 && (
          <Section title="Acceso a sitios web">
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {extension.hostPermissions.map((hp) => (
                <li key={hp} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <Globe size={13} color="var(--vela-fg-muted)" style={{ flexShrink: 0, marginTop: 2 } as CSSProperties} />
                  <span style={{ fontSize: 12, color: 'var(--vela-fg)', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.5 }}>
                    {hp === '<all_urls>' ? 'Todos los sitios web' : hp}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Actions */}
        <Section title="Acciones">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>

            {extension.hasOptionsPage && (
              <ActionButton
                icon={<Settings2 size={14} />}
                label="Abrir página de opciones"
                onClick={() => onOpenOptions(extension.id)}
              />
            )}

            {extension.homepageUrl && (
              <ActionButton
                icon={<ExternalLink size={14} />}
                label="Visitar sitio web de la extensión"
                onClick={() => { if (extension.homepageUrl) window.open(extension.homepageUrl, '_blank'); }}
              />
            )}

            {confirmUninstall ? (
              <div style={{
                display: 'flex', gap: 7, padding: '8px 12px', borderRadius: 7,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              }}>
                <span style={{ flex: 1, fontSize: 12, color: '#ef4444', alignSelf: 'center' }}>
                  {extension.bundled ? '¿Eliminar extensión preinstalada?' : '¿Eliminar esta extensión?'}
                </span>
                <button
                  onClick={() => { onUninstall(extension.id); }}
                  style={{
                    padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                    border: 'none', background: '#ef4444', color: '#fff',
                  }}
                >
                  Eliminar
                </button>
                <button
                  onClick={() => setConfirmUninstall(false)}
                  style={{
                    padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
                    border: '1px solid var(--vela-border)', background: 'transparent', color: 'var(--vela-fg)',
                  }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <ActionButton
                icon={<Trash2 size={14} />}
                label="Eliminar extensión"
                danger
                onClick={() => setConfirmUninstall(true)}
              />
            )}
          </div>
        </Section>

        {/* Install path (collapsed detail, no title noise) */}
        <div style={{ marginTop: 8 }}>
          <details style={{ fontSize: 11, color: 'var(--vela-fg-muted)' }}>
            <summary style={{ cursor: 'pointer', userSelect: 'none', marginBottom: 6 }}>Ruta de instalación</summary>
            <p style={{
              margin: 0, padding: '6px 8px', borderRadius: 5,
              background: 'var(--vela-surface-2)',
              fontFamily: 'monospace', fontSize: 10,
              color: 'var(--vela-fg-muted)', wordBreak: 'break-all',
            }}>
              {extension.installPath}
            </p>
          </details>
        </div>
      </div>
    </aside>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{
        margin: '0 0 8px',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: 'var(--vela-fg-muted)',
      }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', padding: '4px 0' }}>
      <span style={{ width: 70, flexShrink: 0, fontSize: 12, color: 'var(--vela-fg-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--vela-fg)' }}>{value}</span>
    </div>
  );
}

function DtBadge({
  label, accent, amber,
}: { label: string; accent?: boolean; amber?: boolean }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
      background: accent
        ? 'var(--vela-accent-subtle, rgba(59,130,246,0.15))'
        : amber
          ? 'rgba(245,158,11,0.15)'
          : 'var(--vela-surface-2)',
      color: accent
        ? 'var(--vela-accent, #3b82f6)'
        : amber
          ? '#d97706'
          : 'var(--vela-fg-muted)',
    }}>
      {label}
    </span>
  );
}

function LargeToggle({
  enabled, toggling, onToggle,
}: { enabled: boolean; toggling: boolean; onToggle(): void }) {
  return (
    <button
      onClick={onToggle}
      disabled={toggling}
      title={enabled ? 'Desactivar' : 'Activar'}
      style={{
        position: 'relative', width: 44, height: 24, borderRadius: 24, border: 'none',
        cursor: toggling ? 'wait' : 'pointer', flexShrink: 0,
        background: enabled ? 'var(--vela-accent, #3b82f6)' : 'var(--vela-surface-3, rgba(128,128,128,0.3))',
        transition: 'background 0.2s',
        padding: 0,
      }}
    >
      {toggling ? (
        <span style={{
          position: 'absolute', left: '50%', top: '50%',
          width: 12, height: 12, marginLeft: -6, marginTop: -6,
          border: '2px solid rgba(255,255,255,0.6)', borderTopColor: '#fff',
          borderRadius: '50%', animation: 'spin 0.6s linear infinite',
        }} />
      ) : (
        <span style={{
          position: 'absolute', top: 3, left: enabled ? 22 : 3,
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          transition: 'left 0.18s cubic-bezier(.4,0,.2,1)',
        }} />
      )}
    </button>
  );
}

function ToggleRow({
  label, description, icon, enabled, toggling, onToggle,
}: { label: string; description: string; icon?: React.ReactNode; enabled: boolean; toggling: boolean; onToggle(): void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px', borderRadius: 8,
      background: 'var(--vela-surface-2)',
      border: '1px solid var(--vela-border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
        {icon && (
          <span style={{ color: 'var(--vela-fg-muted)', flexShrink: 0, marginTop: 1 }}>{icon}</span>
        )}
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--vela-fg)' }}>{label}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--vela-fg-muted)' }}>{description}</p>
        </div>
      </div>
      <LargeToggle enabled={enabled} toggling={toggling} onToggle={onToggle} />
    </div>
  );
}

function ActionButton({
  icon, label, danger, onClick,
}: { icon: React.ReactNode; label: string; danger?: boolean; onClick(): void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 9,
        width: '100%', padding: '8px 12px', borderRadius: 7, cursor: 'pointer',
        border: `1px solid ${danger ? 'rgba(239,68,68,0.35)' : 'var(--vela-border)'}`,
        background: hov
          ? danger ? 'rgba(239,68,68,0.08)' : 'var(--vela-surface-hover, rgba(128,128,128,0.08))'
          : 'transparent',
        color: danger ? '#ef4444' : 'var(--vela-fg)',
        fontSize: 13, textAlign: 'left',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ color: danger ? '#ef4444' : 'var(--vela-fg-muted)', flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );
}

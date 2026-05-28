import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react';
import type { InstalledExtension } from '@vela/shared';
import { Puzzle, Globe, Settings2, ExternalLink } from 'lucide-react';

interface Props {
  extension: InstalledExtension;
  selected: boolean;
  onSelect(): void;
  onToggle(enabled: boolean): Promise<void>;
  onUninstall(): void;
  onOpenOptions(): void;
  onViewDetails(): void;
}

export function ExtensionCard({
  extension,
  selected,
  onSelect,
  onToggle,
  onUninstall,
  onOpenOptions,
  onViewDetails,
}: Props) {
  const [toggling, setToggling] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Reset confirmDelete when extension changes
  useEffect(() => { setConfirmDelete(false); }, [extension.id]);

  const handleToggle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (toggling) return;
    setToggling(true);
    try {
      await onToggle(!extension.enabled);
    } finally {
      setToggling(false);
    }
  }, [toggling, onToggle, extension.enabled]);

  const handleUninstallClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(true);
  }, []);

  const handleConfirmDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onUninstall();
  }, [onUninstall]);

  const handleCancelDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  }, []);

  const borderColor = selected
    ? 'var(--vela-accent, #3b82f6)'
    : hovered
      ? 'var(--vela-border-hover, rgba(128,128,128,0.35))'
      : 'var(--vela-border)';

  const cardBg = selected
    ? 'var(--vela-accent-subtle, rgba(59,130,246,0.06))'
    : 'var(--vela-surface-1, var(--vela-bg-app))';

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
      style={{
        borderRadius: 10,
        border: `1px solid ${borderColor}`,
        background: cardBg,
        opacity: extension.enabled ? 1 : 0.72,
        transition: 'border-color 0.12s, background 0.12s',
        cursor: 'pointer',
        userSelect: 'none',
        overflow: 'hidden',
      } as CSSProperties}
    >
      {/* ── Content row ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px 12px' }}>

        {/* Icon */}
        <div style={{ flexShrink: 0, paddingTop: 2 }}>
          {extension.iconUrl ? (
            <img
              src={extension.iconUrl}
              alt=""
              width={48}
              height={48}
              style={{
                borderRadius: 8, display: 'block', imageRendering: 'pixelated',
                filter: extension.enabled ? 'none' : 'grayscale(0.8)',
              }}
              draggable={false}
            />
          ) : (
            <div style={{
              width: 48, height: 48, borderRadius: 8, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: 'var(--vela-surface-2)',
              filter: extension.enabled ? 'none' : 'grayscale(0.8)',
            }}>
              <Puzzle size={24} color="var(--vela-fg-muted)" />
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name row */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginBottom: 3 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--vela-fg)', lineHeight: 1.3 }}>
              {extension.name}
            </span>
            <span style={{ fontSize: 12, color: 'var(--vela-fg-muted)' }}>
              v{extension.version}
            </span>
            <Badge
              label={`MV${extension.manifestVersion}`}
              accent={extension.manifestVersion === 3}
              amber={extension.manifestVersion !== 3}
            />
            {extension.bundled && <Badge label="Incluida" accent />}
            {!extension.enabled && <Badge label="Desactivada" muted />}
          </div>

          {/* Description */}
          {extension.description && (
            <p style={{
              margin: '0 0 6px',
              fontSize: 13, color: 'var(--vela-fg-muted)', lineHeight: 1.5,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            } as CSSProperties}>
              {extension.description}
            </p>
          )}

          {/* Homepage link */}
          {extension.homepageUrl && (
            <a
              href={extension.homepageUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 12, color: 'var(--vela-accent)', textDecoration: 'none',
              }}
            >
              <Globe size={11} />
              Visitar sitio web
              <ExternalLink size={10} />
            </a>
          )}
        </div>

        {/* Toggle */}
        <div
          onClick={handleToggle}
          style={{ flexShrink: 0, paddingTop: 4, cursor: toggling ? 'wait' : 'pointer' }}
        >
          <ToggleSwitch enabled={extension.enabled} toggling={toggling} />
        </div>
      </div>

      {/* ── Action bar ───────────────────────────────────────────────────── */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 16px 10px',
          borderTop: '1px solid var(--vela-border)',
          background: selected
            ? 'var(--vela-accent-subtle, rgba(59,130,246,0.04))'
            : 'var(--vela-surface-2, rgba(0,0,0,0.03))',
        }}
      >
        <CardBtn onClick={onViewDetails} label="Detalles" active={selected} />

        {extension.hasOptionsPage && (
          <CardBtn
            onClick={() => { onOpenOptions(); }}
            label="Opciones"
            icon={<Settings2 size={12} />}
          />
        )}

        <div style={{ flex: 1 }} />

        {/* Eliminar / Confirm */}
        {!extension.bundled && (
          confirmDelete ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--vela-fg-muted)' }}>¿Eliminar?</span>
              <CardBtn onClick={handleConfirmDelete} label="Sí" danger />
              <CardBtn onClick={handleCancelDelete} label="No" />
            </div>
          ) : (
            <CardBtn onClick={handleUninstallClick} label="Eliminar" danger />
          )
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToggleSwitch({ enabled, toggling }: { enabled: boolean; toggling: boolean }) {
  return (
    <div
      title={enabled ? 'Desactivar' : 'Activar'}
      style={{
        position: 'relative', width: 38, height: 21, borderRadius: 21,
        background: enabled ? 'var(--vela-accent, #3b82f6)' : 'var(--vela-surface-3, rgba(128,128,128,0.3))',
        transition: 'background 0.2s',
        flexShrink: 0,
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
          position: 'absolute', top: 3, left: enabled ? 18 : 3,
          width: 15, height: 15, borderRadius: '50%', background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left 0.18s cubic-bezier(.4,.0,.2,1)',
        }} />
      )}
    </div>
  );
}

function Badge({
  label, accent, amber, muted,
}: {
  label: string; accent?: boolean; amber?: boolean; muted?: boolean;
}) {
  const bg = accent
    ? 'var(--vela-accent-subtle, rgba(59,130,246,0.15))'
    : amber
      ? 'rgba(245,158,11,0.15)'
      : 'var(--vela-surface-2)';
  const color = accent
    ? 'var(--vela-accent, #3b82f6)'
    : amber
      ? '#d97706'
      : 'var(--vela-fg-muted)';
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 5,
      background: bg, color,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function CardBtn({
  label, onClick, danger, active, icon,
}: {
  label: string;
  onClick(e: React.MouseEvent): void;
  danger?: boolean;
  active?: boolean;
  icon?: React.ReactNode;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
        border: `1px solid ${
          danger ? 'rgba(239,68,68,0.4)' : active ? 'var(--vela-accent)' : 'var(--vela-border)'
        }`,
        background: hov
          ? danger
            ? 'rgba(239,68,68,0.1)'
            : active
              ? 'var(--vela-accent)'
              : 'var(--vela-surface-hover, rgba(128,128,128,0.1))'
          : active
            ? 'var(--vela-accent-subtle, rgba(59,130,246,0.12))'
            : 'transparent',
        color: danger ? '#ef4444' : active ? (hov ? '#fff' : 'var(--vela-accent)') : 'var(--vela-fg)',
        fontSize: 12, fontWeight: 500,
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

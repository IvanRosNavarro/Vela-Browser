import { useCallback, useLayoutEffect, useRef } from 'react';
import { getGlassStyle } from '../../lib/popupGlass';

const params = new URLSearchParams(window.location.search);
const parentWindowId = parseInt(params.get('windowId') ?? '0', 10);
const origin = params.get('origin') ?? '';
const hasPushRequest = params.get('hasPushRequest') === 'true';

const shortOrigin = (() => {
  try { return new URL(origin).hostname; } catch { return origin; }
})();

function close() {
  void window.api.notifications.closePermissionPopup({ windowId: parentWindowId });
}

function BellFilledIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2a6 6 0 0 0-6 6c0 5.25-2.25 7.5-3 8.25v.75h18v-.75C20.25 15.5 18 13.25 18 8a6 6 0 0 0-6-6z" />
      <path d="M10.268 21a2 2 0 0 0 3.464 0H10.268z" />
    </svg>
  );
}

function BellOutlineIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function ActionRow({
  icon,
  label,
  sublabel,
  variant,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  variant: 'accent' | 'default' | 'muted';
  onClick: () => void;
}) {
  const labelColor =
    variant === 'accent' ? 'var(--vela-accent, #5b8ef4)'
    : variant === 'muted' ? 'var(--vela-fg-muted, #8c93a3)'
    : 'var(--vela-fg, #e6e8ee)';

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: sublabel ? '8px 14px' : '9px 14px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        borderRadius: 6,
        color: labelColor,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          variant === 'accent' ? 'rgba(91,142,244,0.14)' : 'var(--vela-hover, rgba(255,255,255,0.06))';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'none';
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: variant === 'accent' ? 500 : 400, lineHeight: 1.3 }}>
          {label}
        </span>
        {sublabel && (
          <span style={{ fontSize: 11, color: 'var(--vela-fg-muted, #8c93a3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sublabel}
          </span>
        )}
      </span>
    </button>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--vela-border, rgba(255,255,255,0.08))', margin: '2px 8px' }} />;
}

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    window.resizeTo(window.outerWidth, el.scrollHeight);
  });

  const handleAllowWithPush = useCallback(async () => {
    await window.api.notifications.grantPermission({ origin, withPush: true });
    close();
  }, []);

  const handleAllow = useCallback(async () => {
    await window.api.notifications.grantPermission({ origin, withPush: false });
    close();
  }, []);

  const handleDeny = useCallback(async () => {
    await window.api.notifications.denyPermission({ origin });
    close();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--vela-bg-surface, #1c1f26)',
        border: '1px solid var(--vela-border, rgba(255,255,255,0.1))',
        borderRadius: 10,
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        ...getGlassStyle(),
      }}
    >
      {/* Header */}
      <div style={{ padding: '13px 14px 11px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ color: 'var(--vela-accent, #5b8ef4)', display: 'flex', flexShrink: 0 }}>
            <BellFilledIcon />
          </span>
          <span
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: 'var(--vela-fg, #e6e8ee)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {shortOrigin}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--vela-fg-muted, #8c93a3)', paddingLeft: 22 }}>
          quiere enviarte notificaciones
        </p>
      </div>

      <Divider />

      {/* Allow options */}
      <div style={{ padding: '4px 4px' }}>
        {hasPushRequest && (
          <ActionRow
            icon={<BellFilledIcon />}
            label="Permitir con push"
            sublabel="También cuando Vela está cerrado"
            variant="accent"
            onClick={() => void handleAllowWithPush()}
          />
        )}
        <ActionRow
          icon={<BellOutlineIcon />}
          label={hasPushRequest ? 'Solo mientras navegas' : 'Permitir'}
          sublabel={hasPushRequest ? 'Solo cuando Vela está abierto' : undefined}
          variant="default"
          onClick={() => void handleAllow()}
        />
      </div>

      <Divider />

      {/* Deny */}
      <div style={{ padding: '4px 4px' }}>
        <ActionRow
          icon={<XIcon />}
          label="Denegar"
          variant="muted"
          onClick={() => void handleDeny()}
        />
      </div>
    </div>
  );
}

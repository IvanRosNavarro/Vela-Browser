import { useCallback, useLayoutEffect, useRef } from 'react';
import { getGlassStyle } from '../../lib/popupGlass';

const params = new URLSearchParams(window.location.search);
const parentWindowId = parseInt(params.get('windowId') ?? '0', 10);
const origin = params.get('origin') ?? '';
const mediaTypesRaw = params.get('mediaTypes') ?? 'video';
const mediaTypes = mediaTypesRaw.split(',').filter(Boolean) as Array<'video' | 'audio'>;

const shortOrigin = (() => {
  try { return new URL(origin).hostname; } catch { return origin; }
})();

const hasVideo = mediaTypes.includes('video');
const hasAudio = mediaTypes.includes('audio');

function label(): string {
  if (hasVideo && hasAudio) return 'acceder a tu cámara y micrófono';
  if (hasVideo) return 'acceder a tu cámara';
  return 'acceder a tu micrófono';
}

function close() {
  void window.api.mediaPermission.closePermissionPopup({ windowId: parentWindowId });
}

function CameraIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function AllowIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
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
  text,
  variant,
  onClick,
}: {
  icon: React.ReactNode;
  text: string;
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
        padding: '9px 14px',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        borderRadius: 6,
        color: labelColor,
        fontSize: 12.5,
        fontWeight: variant === 'accent' ? 500 : 400,
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
      <span>{text}</span>
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

  const handleAllow = useCallback(async () => {
    await window.api.mediaPermission.grant({ origin });
    close();
  }, []);

  const handleDeny = useCallback(async () => {
    await window.api.mediaPermission.deny({ origin });
    close();
  }, []);

  const handleRevoke = useCallback(async () => {
    await window.api.mediaPermission.revoke({ origin });
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
            <CameraIcon />
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
          quiere {label()}
        </p>
      </div>

      <Divider />

      <div style={{ padding: '4px 4px' }}>
        <ActionRow
          icon={<AllowIcon />}
          text="Permitir"
          variant="accent"
          onClick={() => void handleAllow()}
        />
      </div>

      <Divider />

      <div style={{ padding: '4px 4px' }}>
        <ActionRow
          icon={<XIcon />}
          text="Denegar"
          variant="muted"
          onClick={() => void handleDeny()}
        />
        <ActionRow
          icon={<XIcon />}
          text="Revocar permiso existente"
          variant="muted"
          onClick={() => void handleRevoke()}
        />
      </div>
    </div>
  );
}

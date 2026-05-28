import { type CSSProperties, useCallback, useRef } from 'react';
import { useDownloadStore } from '../../../stores/downloadStore';
import { useRuntimeStore } from '../../../stores/runtimeStore';

const pulseStyle = `
@keyframes dl-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.75); }
}
@keyframes dl-fadein {
  from { opacity: 0; transform: scale(0.85); }
  to   { opacity: 1; transform: scale(1); }
}
`;

function IcoDownload() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function DownloadButton() {
  const items = useDownloadStore((s) => s.items);
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(() => {
    if (!buttonRef.current || currentWindowId === null) return;
    const rect = buttonRef.current.getBoundingClientRect();
    void window.api.downloadPopup.open({
      windowId: currentWindowId,
      anchorRect: { left: rect.left, bottom: rect.bottom },
    });
  }, [currentWindowId]);

  if (items.length === 0) return null;

  const activeCount = items.filter((d) => d.state === 'progressing' && !d.paused).length;
  const hasActive = activeCount > 0;

  return (
    <>
      <style>{pulseStyle}</style>
      <button
        ref={buttonRef}
        type="button"
        title={hasActive ? `${activeCount} descarga${activeCount > 1 ? 's' : ''} en progreso` : 'Descargas'}
        onClick={handleClick}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', width: 28, height: 28, borderRadius: 5,
          border: 'none', background: 'transparent',
          color: hasActive ? 'var(--vela-accent, #4f8ef7)' : 'var(--vela-fg-secondary, rgba(255,255,255,0.55))',
          cursor: 'pointer', flexShrink: 0, WebkitAppRegion: 'no-drag', padding: 0,
          animation: 'dl-fadein 150ms ease', transition: 'color 200ms ease',
        } as CSSProperties}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-titlebar-button-hover-bg, rgba(255,255,255,0.08))'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >
        <span style={{ animation: hasActive ? 'dl-pulse 1.6s ease-in-out infinite' : 'none' } as CSSProperties}>
          <IcoDownload />
        </span>
        {activeCount > 1 && (
          <span style={{
            position: 'absolute', bottom: 2, right: 2, width: 14, height: 14,
            borderRadius: '50%', background: 'var(--vela-accent, #4f8ef7)',
            color: '#fff', fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1, pointerEvents: 'none',
          } as CSSProperties}>
            {activeCount > 9 ? '9+' : activeCount}
          </span>
        )}
        {activeCount === 1 && (
          <span style={{
            position: 'absolute', bottom: 3, right: 3, width: 6, height: 6,
            borderRadius: '50%', background: 'var(--vela-accent, #4f8ef7)',
            animation: 'dl-pulse 1.6s ease-in-out infinite', pointerEvents: 'none',
          } as CSSProperties} />
        )}
      </button>
    </>
  );
}

import { type CSSProperties, useRef } from 'react';
import { useMediaStore } from '../../../stores/mediaStore';
import { useSettings } from '../../../pages/settings/lib/useSettings';

const pulseStyle = `
@keyframes media-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.85); }
}
`;

export function MediaButton() {
  const sources = useMediaStore((s) => s.sources);
  const activeCount = useMediaStore((s) => s.activeCount);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { get: getSetting } = useSettings();
  const widgetEnabled = getSetting('media:widget-enabled', true);

  if (!widgetEnabled || sources.length === 0) return null;

  const hasActive = activeCount > 0;
  const allPaused = sources.length > 0 && activeCount === 0;
  const tooltip = allPaused ? 'Reproducción pausada' : 'Controlando reproducción';

  function handleClick() {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    void window.api.media.openPopup({ x: rect.right, y: rect.bottom + 4 });
  }

  return (
    <>
      <style>{pulseStyle}</style>
      <button
        ref={buttonRef}
        title={tooltip}
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          width: 30,
          height: 28,
          borderRadius: 5,
          border: 'none',
          background: 'transparent',
          color: 'var(--vela-titlebar-fg)',
          cursor: 'pointer',
          opacity: allPaused ? 0.6 : 1,
          flexShrink: 0,
          WebkitAppRegion: 'no-drag',
          padding: 0,
        } as CSSProperties}
      >
        <span style={{ fontSize: 15, lineHeight: 1, userSelect: 'none' }}>♩</span>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--vela-accent, #4f8ef7)',
            flexShrink: 0,
            opacity: hasActive ? 1 : 0.4,
            animation: hasActive ? 'media-pulse 1.8s ease-in-out infinite' : 'none',
          } as CSSProperties}
        />
      </button>
    </>
  );
}

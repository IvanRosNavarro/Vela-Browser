import { useCallback, useRef, type CSSProperties } from 'react';
import { useRuntimeStore } from '../../../stores/runtimeStore';
import velaIcon from '../../../assets/vela-icon.png';

export function VelaMenuButton() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);

  const handleClick = useCallback(() => {
    if (!triggerRef.current || currentWindowId === null) return;
    const rect = triggerRef.current.getBoundingClientRect();
    void window.api.velaMenu.open({
      windowId: currentWindowId,
      anchorRect: { left: rect.left, bottom: rect.bottom },
    });
  }, [currentWindowId]);

  return (
    <button
      ref={triggerRef}
      type="button"
      aria-label="Menú de Vela"
      title="Menú de Vela"
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        border: 'none',
        borderRadius: 5,
        background: 'transparent',
        cursor: 'pointer',
        flexShrink: 0,
        padding: 4,
        WebkitAppRegion: 'no-drag',
        transition: 'background 120ms ease',
        outline: 'none',
      } as CSSProperties}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          'var(--vela-titlebar-button-hover-bg, rgba(255,255,255,0.08))';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      <img
        src={velaIcon}
        width={20}
        height={20}
        alt=""
        style={{ display: 'block', pointerEvents: 'none' }}
      />
    </button>
  );
}

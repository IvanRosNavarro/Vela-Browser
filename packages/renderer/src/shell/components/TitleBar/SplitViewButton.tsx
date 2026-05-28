import { useState, useRef, useEffect, useCallback, type CSSProperties } from 'react';
import ReactDOM from 'react-dom';
import { useLayoutStore } from '../../../stores/layoutStore';
import { useOverlayStore } from '../../../stores/overlayStore';

function SplitPopover({ onClose, anchorRef }: {
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const setSplit = useLayoutStore((s) => s.setSplit);
  const release = useOverlayStore((s) => s.release);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => { release(); };
  }, [release]);

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const rect = anchorRef.current?.getBoundingClientRect();
  const top = rect ? rect.bottom + 6 : 44;
  const right = rect ? window.innerWidth - rect.right : 0;

  const handleSplit = (mode: 'split-h' | 'split-v'): void => {
    void setSplit(mode);
    onClose();
  };

  return ReactDOM.createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top,
        right,
        background: 'var(--vela-bg-elevated)',
        border: '1px solid var(--vela-border)',
        borderRadius: 8,
        padding: '4px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        zIndex: 9999,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        minWidth: 220,
      } as CSSProperties}
    >
      <SplitItem
        label="Dividir horizontalmente"
        onClick={() => handleSplit('split-h')}
        icon={
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="12" y1="3" x2="12" y2="21" />
          </svg>
        }
      />
      <SplitItem
        label="Dividir verticalmente"
        onClick={() => handleSplit('split-v')}
        icon={
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="12" x2="21" y2="12" />
          </svg>
        }
      />
    </div>,
    document.body,
  );
}

function SplitItem({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 12px',
        borderRadius: 6,
        border: 'none',
        background: hovered ? 'var(--vela-bg-row-hover)' : 'transparent',
        color: 'var(--vela-fg)',
        cursor: 'pointer',
        fontSize: 13,
        width: '100%',
        textAlign: 'left',
        transition: 'background 100ms',
      } as CSSProperties}
    >
      <span style={{ color: 'var(--vela-fg-muted)', flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );
}

export function SplitViewButton() {
  const layout = useLayoutStore((s) => s.layout);
  const closeSplit = useLayoutStore((s) => s.closeSplit);
  const acquireAndWait = useOverlayStore((s) => s.acquireAndWait);
  const [showPopover, setShowPopover] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isSplit = layout.mode !== 'single';

  const handleClick = useCallback(async (): Promise<void> => {
    if (isSplit) {
      void closeSplit();
    } else {
      await acquireAndWait();
      setShowPopover((v) => !v);
    }
  }, [isSplit, closeSplit, acquireAndWait]);

  const tooltip = isSplit ? 'Cerrar división' : 'Dividir pantalla';
  const accentColor = 'var(--vela-accent, #4f8ef7)';

  return (
    <>
      <button
        ref={buttonRef}
        title={tooltip}
        onClick={() => void handleClick()}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 5,
          border: 'none',
          background: isSplit ? accentColor : 'transparent',
          color: isSplit ? '#fff' : 'var(--vela-titlebar-fg)',
          cursor: 'pointer',
          opacity: isSplit ? 1 : 0.65,
          flexShrink: 0,
          WebkitAppRegion: 'no-drag',
          padding: 0,
        } as CSSProperties}
      >
        {isSplit ? (
          layout.mode === 'split-v' ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="12" x2="21" y2="12" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="12" y1="3" x2="12" y2="21" />
            </svg>
          )
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="12" y1="3" x2="12" y2="21" />
          </svg>
        )}
      </button>
      {showPopover && (
        <SplitPopover
          anchorRef={buttonRef}
          onClose={() => setShowPopover(false)}
        />
      )}
    </>
  );
}

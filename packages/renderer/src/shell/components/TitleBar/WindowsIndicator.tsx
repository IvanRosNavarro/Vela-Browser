import { useState, useCallback, useEffect, useRef, type CSSProperties } from 'react';
import ReactDOM from 'react-dom';
import { useMultiWindowStore } from '../../../stores/multiWindowStore';
import { call } from '../../../lib/ipc';

function WindowsPopover({
  onClose,
  anchorRef,
}: {
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const openWindows = useMultiWindowStore((s) => s.openWindows);
  const stableWindowId = useMultiWindowStore((s) => s.stableWindowId);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, anchorRef]);

  async function handleFocus(windowId: string) {
    onClose();
    await call(() => window.api.window.focus({ windowId }));
  }

  const anchorRect = anchorRef.current?.getBoundingClientRect();
  const style: CSSProperties = {
    position: 'fixed',
    top: (anchorRect?.bottom ?? 0) + 4,
    right: window.innerWidth - (anchorRect?.right ?? 0),
    zIndex: 9999,
    background: 'var(--vela-bg-surface, #1c1f26)',
    border: '1px solid var(--vela-border, rgba(255,255,255,0.1))',
    borderRadius: 8,
    padding: '6px 0',
    minWidth: 220,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  };

  return ReactDOM.createPortal(
    <div ref={popoverRef} style={style}>
      {openWindows.map((win) => {
        const isCurrent = win.windowId === stableWindowId;
        return (
          <button
            key={win.windowId}
            onClick={() => void handleFocus(win.windowId)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '7px 14px',
              background: isCurrent ? 'var(--vela-accent-muted, rgba(79,142,247,0.15))' : 'transparent',
              border: 'none',
              color: 'var(--vela-fg, #e0e0e0)',
              cursor: isCurrent ? 'default' : 'pointer',
              textAlign: 'left',
              fontSize: 12,
              borderRadius: 0,
            } as CSSProperties}
            disabled={isCurrent}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {win.workspaceName ?? '(sin workspace)'}
            </span>
            {isCurrent && (
              <span style={{ fontSize: 10, opacity: 0.5, flexShrink: 0 }}>Esta</span>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

export function WindowsIndicator() {
  const openWindows = useMultiWindowStore((s) => s.openWindows);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleToggle = useCallback(() => setOpen((v) => !v), []);
  const handleClose = useCallback(() => setOpen(false), []);

  // Solo mostrar si hay más de 1 ventana
  if (openWindows.length <= 1) return null;

  return (
    <>
      <button
        ref={btnRef}
        title={`${openWindows.length} ventanas abiertas de este perfil`}
        onClick={handleToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          height: 28,
          padding: '0 6px',
          borderRadius: 5,
          border: 'none',
          background: open ? 'var(--vela-bg-hover, rgba(255,255,255,0.08))' : 'transparent',
          color: 'var(--vela-titlebar-fg)',
          cursor: 'pointer',
          opacity: 0.65,
          flexShrink: 0,
          WebkitAppRegion: 'no-drag',
          fontSize: 11,
        } as CSSProperties}
      >
        {/* ti-browser icon */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        <span>{openWindows.length}</span>
      </button>

      {open && <WindowsPopover onClose={handleClose} anchorRef={btnRef} />}
    </>
  );
}

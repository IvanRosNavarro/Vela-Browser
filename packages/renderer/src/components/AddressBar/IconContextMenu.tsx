import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

const MENU_WIDTH = 230;
const MENU_HEIGHT = 76;

const ITEM_BASE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '7px 12px',
  border: 'none',
  borderRadius: 5,
  background: 'transparent',
  fontSize: 12,
  width: '100%',
  textAlign: 'left',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  lineHeight: '1.3',
};

function MenuItem({
  label,
  onClick,
  muted,
}: {
  label: string;
  onClick: () => void;
  muted?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      style={{
        ...ITEM_BASE,
        background: hovered ? 'var(--vela-bg-row-hover, rgba(255,255,255,0.07))' : 'transparent',
        color: muted
          ? 'var(--vela-fg-muted, #888)'
          : 'var(--vela-fg, #e0e0e0)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export interface IconContextMenuProps {
  x: number;
  y: number;
  iconLabel: string;
  onHide: () => void;
  onSettings: () => void;
  onClose: () => void;
}

export function IconContextMenu({ x, y, iconLabel, onHide, onSettings, onClose }: IconContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', onMouseDown, true);
    return () => window.removeEventListener('mousedown', onMouseDown, true);
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(4, Math.min(x, vw - MENU_WIDTH - 4));
  const top = Math.max(4, Math.min(y, vh - MENU_HEIGHT - 4));

  const menu = (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 9999,
        background: 'var(--vela-bg-surface, #1c1f26)',
        border: '1px solid var(--vela-border, #333)',
        borderRadius: 8,
        padding: '4px',
        minWidth: MENU_WIDTH,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      <MenuItem
        label={`Ocultar "${iconLabel}"`}
        onClick={() => { onHide(); onClose(); }}
      />
      <div style={{ height: 1, background: 'var(--vela-border, #333)', margin: '3px 8px' }} />
      <MenuItem
        label="Ajustes de barra de direcciones"
        onClick={() => { onSettings(); onClose(); }}
        muted
      />
    </div>
  );

  return ReactDOM.createPortal(menu, document.body);
}

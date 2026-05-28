import type { CSSProperties } from 'react';
import type { DropZone } from './dropValidation';

interface DropIndicatorProps {
  zone: DropZone;
  visible: boolean;
}

const lineStyle: CSSProperties = {
  position: 'absolute',
  left: 6,
  right: 6,
  height: 2,
  background: 'var(--vela-drop-line)',
  borderRadius: 2,
  pointerEvents: 'none',
};

export function DropIndicator({ zone, visible }: DropIndicatorProps) {
  if (!visible) return null;
  if (zone === 'before') {
    return <div style={{ ...lineStyle, top: -1 }} aria-hidden />;
  }
  if (zone === 'after') {
    return <div style={{ ...lineStyle, bottom: -1 }} aria-hidden />;
  }
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 2,
        borderRadius: 6,
        outline: '2px solid var(--vela-drop-line)',
        background: 'var(--vela-drop-bg)',
        pointerEvents: 'none',
      }}
    />
  );
}

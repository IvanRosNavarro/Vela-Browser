import type { CSSProperties } from 'react';

interface DragRegionProps {
  className?: string;
  style?: CSSProperties;
}

export function DragRegion({ className, style }: DragRegionProps) {
  return (
    <div
      className={className}
      style={{ WebkitAppRegion: 'drag', ...style } as CSSProperties}
      aria-hidden
    />
  );
}

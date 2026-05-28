import type { CSSProperties } from 'react';

interface IndentationGuidesProps {
  depth: number;
  indent: number;
  enabled: boolean;
}

export function IndentationGuides({
  depth,
  indent,
  enabled,
}: IndentationGuidesProps) {
  if (!enabled || depth === 0) return null;
  const guides: CSSProperties[] = [];
  for (let i = 0; i < depth; i += 1) {
    guides.push({
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: i * indent + indent / 2,
      width: 1,
      background: 'var(--vela-indent-guide)',
      pointerEvents: 'none',
    });
  }
  return (
    <>
      {guides.map((style, i) => (
        <div key={i} style={style} aria-hidden />
      ))}
    </>
  );
}

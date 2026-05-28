import { useState, type CSSProperties } from 'react';

interface FaviconProps {
  src: string | null;
  alt?: string;
  size?: number;
  fallbackChar?: string;
}

export function Favicon({
  src,
  alt = '',
  size = 16,
  fallbackChar,
}: FaviconProps) {
  const [errored, setErrored] = useState(false);
  const style: CSSProperties = {
    width: size,
    height: size,
    flex: '0 0 auto',
    borderRadius: 3,
  };

  if (!src || errored) {
    return (
      <div
        aria-hidden
        style={{
          ...style,
          background: 'var(--vela-bg-folder-hover)',
          color: 'var(--vela-fg-muted)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.floor(size * 0.6),
          fontWeight: 600,
          textTransform: 'uppercase',
        }}
      >
        {(fallbackChar ?? '·').slice(0, 1)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      style={style}
      onError={() => setErrored(true)}
      draggable={false}
    />
  );
}

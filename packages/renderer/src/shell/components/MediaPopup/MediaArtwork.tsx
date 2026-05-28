import type { CSSProperties } from 'react';

interface MediaArtworkProps {
  artworkUrl: string | null;
  title: string;
  domain: string;
  size?: number;
}

function domainColor(domain: string): string {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 55%, 40%)`;
}

export function MediaArtwork({ artworkUrl, title, domain, size = 48 }: MediaArtworkProps) {
  if (artworkUrl) {
    return (
      <img
        src={artworkUrl}
        alt={title}
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          objectFit: 'cover',
          flexShrink: 0,
        }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        background: domainColor(domain),
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: size * 0.4,
      } as CSSProperties}
    >
      ♩
    </div>
  );
}

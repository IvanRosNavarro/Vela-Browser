import { useState } from 'react';
import type { MruTabEntry } from '../../stores/mruSwitcherStore';

function domainBg(url: string): string {
  try {
    const domain = new URL(url).hostname;
    let hash = 5381;
    for (let i = 0; i < domain.length; i++) {
      hash = ((hash << 5) + hash + domain.charCodeAt(i)) | 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 35%, 22%)`;
  } catch {
    return 'var(--vela-bg-sidebar-elev)';
  }
}

function domainInitial(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')[0]?.toUpperCase() ?? '?';
  } catch {
    return '?';
  }
}

interface Props {
  tab: MruTabEntry;
}

export function MruFaviconFallback({ tab }: Props) {
  const [faviconError, setFaviconError] = useState(false);

  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{ background: domainBg(tab.url) }}
    >
      {tab.favicon && !faviconError ? (
        <img
          src={tab.favicon}
          alt=""
          onError={() => setFaviconError(true)}
          style={{ width: 40, height: 40, objectFit: 'contain' }}
        />
      ) : (
        <span style={{ fontSize: 28, fontWeight: 700, opacity: 0.55, color: '#fff' }}>
          {domainInitial(tab.url)}
        </span>
      )}
    </div>
  );
}

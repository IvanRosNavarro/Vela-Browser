import { ChevronRight } from 'lucide-react';

interface UrlBreadcrumbProps {
  url: string;
  onNavigate: (url: string) => void;
}

interface BreadcrumbSegment {
  label: string;
  url: string;
}

function parseBreadcrumb(rawUrl: string): BreadcrumbSegment[] | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const segments = parsed.pathname
    .split('/')
    .filter((s) => s.length > 0);

  if (segments.length < 2) return null;

  const base = `${parsed.protocol}//${parsed.host}`;
  const crumbs: BreadcrumbSegment[] = [{ label: parsed.host, url: `${base}/` }];

  let path = '';
  for (const seg of segments) {
    path += `/${seg}`;
    crumbs.push({ label: decodeURIComponent(seg), url: `${base}${path}` });
  }

  return crumbs;
}

export function UrlBreadcrumb({ url, onNavigate }: UrlBreadcrumbProps) {
  const crumbs = parseBreadcrumb(url);
  if (!crumbs) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        minWidth: 0,
        overflow: 'hidden',
        gap: 0,
        flex: 1,
      }}
    >
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <span key={crumb.url} style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <button
              type="button"
              title={crumb.url}
              onClick={() => onNavigate(crumb.url)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '0 2px',
                color: isLast
                  ? 'var(--vela-fg)'
                  : 'var(--vela-addressbar-fg-muted)',
                fontWeight: isLast ? 600 : 400,
                fontSize: 12,
                maxWidth: idx === 0 ? 160 : 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flexShrink: 1,
              }}
            >
              {crumb.label}
            </button>
            {!isLast && (
              <ChevronRight
                size={11}
                style={{ color: 'var(--vela-addressbar-fg-muted)', flexShrink: 0, opacity: 0.6 }}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

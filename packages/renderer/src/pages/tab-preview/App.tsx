import { useEffect, useState } from 'react';
import { IPC_EVENTS } from '@vela/shared';

const params = new URLSearchParams(window.location.search);

interface PreviewData {
  tabId: string;
  profileId: string;
  title: string;
  url: string;
}

function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== '/' ? u.pathname : '');
  } catch {
    return url;
  }
}

export function App() {
  const [data, setData] = useState<PreviewData>({
    tabId: params.get('tabId') ?? '',
    profileId: params.get('profileId') ?? '',
    title: params.get('title') ?? '',
    url: params.get('url') ?? '',
  });
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    const off = window.api.on(IPC_EVENTS.TAB_PREVIEW_DATA, (payload) => {
      setData(payload);
      setImgError(false);
    });
    return off;
  }, []);

  const previewSrc = data.profileId && data.tabId
    ? `vela-preview://${data.profileId}/${data.tabId}`
    : null;

  const FOOTER_HEIGHT = 44;

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: 'var(--vela-bg-surface, #1c1f26)',
      border: '1px solid var(--vela-border, rgba(255,255,255,0.1))',
      borderRadius: 10,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      {/* Preview image — ocupa todo el espacio restante */}
      <div style={{
        height: `calc(100% - ${FOOTER_HEIGHT}px)`,
        flexShrink: 0,
        background: 'var(--vela-bg-base, #141519)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {previewSrc && !imgError ? (
          <img
            key={data.tabId}
            src={previewSrc}
            alt=""
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span style={{ fontSize: 32, opacity: 0.2 }}>◻</span>
        )}
      </div>

      {/* Title + URL footer — altura fija */}
      <div style={{
        height: FOOTER_HEIGHT,
        flexShrink: 0,
        padding: '0 10px',
        borderTop: '1px solid var(--vela-border, rgba(255,255,255,0.07))',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 2,
        overflow: 'hidden',
      }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--vela-fg, #e6e8ee)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {data.title || truncateUrl(data.url)}
        </div>
        <div style={{
          fontSize: 11,
          color: 'var(--vela-fg-muted, #8c93a3)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {truncateUrl(data.url)}
        </div>
      </div>
    </div>
  );
}

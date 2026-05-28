import { type CSSProperties, useEffect, useState } from 'react';
import type { MediaSource } from '@vela/shared';
import { IPC_EVENTS } from '@vela/shared';
import { themeManager } from '../../shared-ui/theme';
import { MediaSourceRow } from '../../shell/components/MediaPopup/MediaSourceRow';

const PULSE_KEYFRAME = `
@keyframes media-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.85); }
}
`;

export function App() {
  const [sources, setSources] = useState<MediaSource[]>([]);

  useEffect(() => {
    themeManager.initialize();
    return () => themeManager.destroy();
  }, []);

  useEffect(() => {
    void window.api.media.getSources().then((res) => {
      if (res.ok) setSources(res.data);
    });
    const off = window.api.on(IPC_EVENTS.MEDIA_CHANGED, (payload) => {
      setSources(payload.sources);
    });
    return off;
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void window.api.media.closePopup();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (sources.length === 0) return null;

  return (
    <div
      style={{
        background: 'var(--vela-surface, #1e1e2e)',
        border: '1px solid var(--vela-border, #313244)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        fontFamily: 'system-ui, sans-serif',
      } as CSSProperties}
    >
      <style>{PULSE_KEYFRAME}</style>

      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--vela-fg-muted, #6c7086)',
          borderBottom: '1px solid var(--vela-border, #313244)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span>♩</span>
        <span>
          {sources.length === 1 ? 'Reproduciendo' : `${sources.length} fuentes de audio`}
        </span>
      </div>

      {sources.map((source, idx) => (
        <div key={source.tabId}>
          {idx > 0 && (
            <div
              style={{
                height: 1,
                background: 'var(--vela-border, #313244)',
                margin: '0 12px',
              }}
            />
          )}
          <MediaSourceRow
            source={source}
            onActivate={() => {
              void window.api.media
                .activateTab({ tabId: source.tabId, windowId: source.windowId })
                .then(() => window.api.media.closePopup());
            }}
          />
        </div>
      ))}
    </div>
  );
}

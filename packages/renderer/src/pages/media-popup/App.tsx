import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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

/** Perfil de la ventana que abrió el popup; llega en la URL. */
const POPUP_PROFILE_ID = new URLSearchParams(window.location.search).get('profileId') ?? '';

function forProfile(sources: MediaSource[]): MediaSource[] {
  if (!POPUP_PROFILE_ID) return sources;
  return sources.filter((s) => s.profileId === POPUP_PROFILE_ID);
}

export function App() {
  const [sources, setSources] = useState<MediaSource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    themeManager.initialize();
    return () => themeManager.destroy();
  }, []);

  useEffect(() => {
    void window.api.media.getSources().then((res) => {
      if (res.ok) setSources(forProfile(res.data));
      setLoaded(true);
    });
    const off = window.api.on(IPC_EVENTS.MEDIA_CHANGED, (payload) => {
      setSources(forProfile(payload.sources));
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

  // La ventana se ajusta a lo que mide el contenido: una fuente sin artista ni
  // duración ocupa bastante menos que otra con las dos.
  useLayoutEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const report = () => {
      void window.api.media.resizePopup({ height: Math.ceil(node.getBoundingClientRect().height) });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [sources.length]);

  const patch = useCallback((tabId: string, next: Partial<MediaSource>) => {
    setSources((prev) => prev.map((s) => (s.tabId === tabId ? { ...s, ...next } : s)));
  }, []);

  /** Vuelve a la verdad de main: el optimismo del botón dura lo que tarde esto. */
  const resync = useCallback(() => {
    void window.api.media.getSources().then((res) => {
      if (res.ok) setSources(forProfile(res.data));
    });
  }, []);

  // Sin nada que enseñar no se queda una ventana vacía flotando. Se espera a la
  // primera carga: al abrir, la lista está vacía hasta que responde main.
  useEffect(() => {
    if (loaded && sources.length === 0) void window.api.media.closePopup();
  }, [loaded, sources.length]);

  if (sources.length === 0) return null;

  return (
    <div
      ref={rootRef}
      style={{
        background: 'var(--vela-surface, #1e1e2e)',
        border: '1px solid var(--vela-border, #313244)',
        borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        fontFamily: 'system-ui, sans-serif',
        // El alto de la ventana lo pone main (tope de 520 px): a partir de ahí
        // el contenido no puede crecer más y la lista se desplaza dentro.
        maxHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
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

      <div style={{ overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
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
            onTogglePlay={() => {
              // El estado real llega por `state:media-changed`; esto solo evita
              // que el botón se quede quieto hasta que Chromium avise.
              patch(source.tabId, { isPlaying: !source.isPlaying });
              const action = source.isPlaying ? 'pause' : 'play';
              void window.api.media[action]({ tabId: source.tabId }).then(resync);
            }}
            onSkipNext={() => void window.api.media.skipNext({ tabId: source.tabId })}
            onSkipPrev={() => void window.api.media.skipPrev({ tabId: source.tabId })}
            onSeekTo={(time) => void window.api.media.seekTo({ tabId: source.tabId, time })}
            onTogglePip={() => {
              void window.api.media
                .togglePictureInPicture({ tabId: source.tabId })
                .then(() => window.api.media.closePopup());
            }}
          />
        </div>
      ))}
      </div>
    </div>
  );
}

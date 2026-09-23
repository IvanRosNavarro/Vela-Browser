import { type CSSProperties, useEffect, useRef, useState } from 'react';
import type { MediaSource } from '@vela/shared';
import { MediaArtwork } from './MediaArtwork';

const PULSE_KEYFRAME = `
@keyframes media-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.85); }
}
`;

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function artworkDomain(source: MediaSource): string {
  if (source.artworkUrl) {
    try { return new URL(source.artworkUrl).hostname; } catch { /* fallthrough */ }
  }
  return source.tabId;
}

interface CtrlBtnProps {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  large?: boolean;
}

function CtrlBtn({ onClick, disabled, title, children, large }: CtrlBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: 'none',
        border: 'none',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 0.8,
        color: 'var(--vela-fg)',
        padding: '4px 5px',
        borderRadius: 4,
        fontSize: large ? 18 : 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
      } as CSSProperties}
    >
      {children}
    </button>
  );
}

interface MediaSourceRowProps {
  source: MediaSource;
  onActivate: () => void;
  onTogglePlay: () => void;
  onSkipNext: () => void;
  onSkipPrev: () => void;
  /** Salto a un punto concreto, en segundos. */
  onSeekTo: (time: number) => void;
  /** Alterna la imagen en imagen del vídeo de la pestaña. Sin él no se muestra el botón. */
  onTogglePip?: () => void;
}

export function MediaSourceRow({
  source,
  onActivate,
  onTogglePlay,
  onSkipNext,
  onSkipPrev,
  onSeekTo,
  onTogglePip,
}: MediaSourceRowProps) {
  const [currentTime, setCurrentTime] = useState(source.currentTime ?? 0);
  const [duration, setDuration] = useState(source.duration);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!source.isPlaying) return;
    intervalRef.current = setInterval(() => {
      void window.api.media.getCurrentTime({ tabId: source.tabId }).then((res) => {
        if (res.ok) {
          setCurrentTime(res.data.currentTime);
          setDuration(res.data.duration);
        }
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [source.tabId, source.isPlaying]);

  const hasDuration = duration !== null && duration > 0;
  const progress = hasDuration ? (currentTime / duration) * 100 : 0;
  const domain = artworkDomain(source);
  const canSeek = source.canSeek && hasDuration;

  function handleSeekClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!canSeek || duration === null) return;
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const time = ratio * duration;
    setCurrentTime(time);
    onSeekTo(time);
  }

  return (
    <div style={{ padding: '10px 12px' }}>
      <style>{PULSE_KEYFRAME}</style>

      {/* Artwork + meta */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
        <MediaArtwork
          artworkUrl={source.artworkUrl}
          title={source.title}
          domain={domain}
          size={48}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--vela-fg)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {source.title || 'Reproduciendo'}
          </div>
          {(source.artist || source.album) && (
            <div style={{
              fontSize: 11,
              color: 'var(--vela-fg-muted)',
              marginTop: 2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {[source.artist, source.album].filter(Boolean).join(' · ')}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <span style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: source.isPlaying
                ? 'var(--vela-accent, #4f8ef7)'
                : 'var(--vela-fg-muted)',
              flexShrink: 0,
              animation: source.isPlaying ? 'media-pulse 1.8s ease-in-out infinite' : 'none',
            } as CSSProperties} />
            <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)' }}>
              {source.isPlaying ? 'Reproduciendo' : 'Pausado'}
            </span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {hasDuration && (
        <div style={{ marginBottom: 8 }}>
          <div
            ref={barRef}
            onClick={handleSeekClick}
            title={canSeek ? 'Ir a este punto' : undefined}
            style={{
              height: 3,
              background: 'var(--vela-border)',
              borderRadius: 2,
              overflow: 'hidden',
              marginBottom: 4,
              cursor: canSeek ? 'pointer' : 'default',
            } as CSSProperties}
          >
            <div style={{
              height: '100%',
              width: `${Math.min(progress, 100)}%`,
              background: 'var(--vela-accent, #4f8ef7)',
              borderRadius: 2,
              transition: 'width 0.5s linear',
            }} />
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10,
            color: 'var(--vela-fg-muted)',
          }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration ?? 0)}</span>
          </div>
        </div>
      )}

      {/* Controles. Los saltos de pista solo se ofrecen si la página registró su
          handler: sin él no hay forma de cambiar de canción y el botón engañaría. */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 2,
        marginBottom: 8,
      }}>
        <CtrlBtn
          onClick={onSkipPrev}
          disabled={!source.canSkipPrev}
          title={source.canSkipPrev ? 'Anterior' : 'Esta página no permite cambiar de pista'}
        >
          ⏮
        </CtrlBtn>
        <CtrlBtn
          large
          onClick={onTogglePlay}
          title={source.isPlaying ? 'Pausar' : 'Reproducir'}
        >
          {source.isPlaying ? '⏸' : '▶'}
        </CtrlBtn>
        <CtrlBtn
          onClick={onSkipNext}
          disabled={!source.canSkipNext}
          title={source.canSkipNext ? 'Siguiente' : 'Esta página no permite cambiar de pista'}
        >
          ⏭
        </CtrlBtn>
        {onTogglePip && (
          <CtrlBtn onClick={onTogglePip} title="Imagen en imagen">⧉</CtrlBtn>
        )}
      </div>

      {/* Go to tab */}
      <button
        onClick={onActivate}
        style={{
          width: '100%',
          background: 'var(--vela-bg-row-hover)',
          border: '1px solid var(--vela-border)',
          borderRadius: 5,
          padding: '5px 10px',
          fontSize: 11,
          color: 'var(--vela-fg)',
          cursor: 'pointer',
          textAlign: 'left',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        } as CSSProperties}
        title={`Ir a la pestaña: ${source.title}`}
      >
        🔗 Ir a la pestaña → {source.title}
      </button>
    </div>
  );
}

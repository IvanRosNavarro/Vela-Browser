import { useState } from 'react';
import { PauseCircle } from 'lucide-react';
import type { MruTabEntry } from '../../stores/mruSwitcherStore';
import { MruFaviconFallback } from './MruFaviconFallback';
import { useRuntimeStore } from '../../stores/runtimeStore';

interface Props {
  tab: MruTabEntry;
  isSelected: boolean;
  previewsEnabled: boolean;
  onClick: () => void;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function fallbackTooltip(tab: MruTabEntry): string {
  const now = Date.now();
  const lastActive = tab.lastActiveAt ?? 0;
  if (lastActive > 0 && now - lastActive < 5 * 60_000) {
    return 'Previsualización pendiente de generarse.';
  }
  return 'Previsualización no disponible.';
}

const CARD_W = 260;
const CARD_H = 180;
const PREVIEW_H = 130;
const FOOTER_H = CARD_H - PREVIEW_H; // 50px

export { CARD_W, CARD_H };

export function MruPreview({ tab, isSelected, previewsEnabled, onClick }: Props) {
  const profileId = useRuntimeStore((s) => s.currentProfileId);
  const [imgError, setImgError] = useState(false);

  const previewUrl =
    previewsEnabled && profileId ? `vela-preview://${profileId}/${tab.id}` : null;
  const showPreviewImg = previewUrl !== null && !imgError;
  const showFallbackTooltip = previewsEnabled && imgError;

  const displayTitle = tab.customTitle ?? tab.originalTitle;
  const domain = getDomain(tab.url);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col overflow-hidden text-left"
      style={{
        width: CARD_W,
        height: CARD_H,
        flexShrink: 0,
        outline: isSelected ? '2px solid var(--vela-accent)' : '2px solid transparent',
        outlineOffset: 0,
        borderRadius: 10,
        border: 'none',
        background: 'var(--vela-bg-sidebar-elev)',
        cursor: 'pointer',
        opacity: isSelected ? 1 : 0.55,
        transition: 'opacity 0.15s ease, outline-color 0.15s ease, filter 0.15s ease',
        filter: isSelected
          ? 'drop-shadow(0 0 12px color-mix(in srgb, var(--vela-accent) 55%, transparent))'
          : 'none',
      }}
    >
      {/* Preview area */}
      <div
        className="relative overflow-hidden"
        style={{ height: PREVIEW_H, flexShrink: 0, borderRadius: '8px 8px 0 0' }}
      >
        {showPreviewImg ? (
          <img
            src={previewUrl}
            alt=""
            onError={() => setImgError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            title={showFallbackTooltip ? fallbackTooltip(tab) : undefined}
            style={{ width: '100%', height: '100%' }}
          >
            <MruFaviconFallback tab={tab} />
          </div>
        )}
        {tab.discarded && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.45)' }}
          >
            <PauseCircle size={30} style={{ color: 'rgba(255,255,255,0.7)' }} />
          </div>
        )}
      </div>

      {/* Footer: title + domain */}
      <div
        className="flex items-center gap-2 overflow-hidden px-2.5"
        style={{ height: FOOTER_H, flexShrink: 0 }}
      >
        {tab.favicon && (
          <img
            src={tab.favicon}
            alt=""
            style={{ width: 14, height: 14, objectFit: 'contain', flexShrink: 0 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <span
            className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] leading-tight"
            style={{ color: 'var(--vela-fg)' }}
          >
            {displayTitle}
          </span>
          {domain && (
            <span
              className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] leading-tight"
              style={{ color: 'var(--vela-fg-muted)' }}
            >
              {domain}
            </span>
          )}
        </div>
        {tab.workspaceName && (
          <span
            className="shrink-0 rounded px-1 text-[9px]"
            style={{ background: 'var(--vela-bg-sidebar)', color: 'var(--vela-fg-muted)' }}
          >
            {tab.workspaceName}
          </span>
        )}
      </div>
    </button>
  );
}

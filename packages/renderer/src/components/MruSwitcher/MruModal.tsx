import { useCallback, useEffect, useRef } from 'react';
import { useMruSwitcherStore } from '../../stores/mruSwitcherStore';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useOverlay } from '../../lib/useOverlay';
import { MruPreview, CARD_W, CARD_H } from './MruPreview';

const GAP = 12;
const CARD_STRIDE = CARD_W + GAP; // 272

export function MruModal() {
  const isOpen = useMruSwitcherStore((s) => s.isOpen);
  const tabs = useMruSwitcherStore((s) => s.tabs);
  const selectedIndex = useMruSwitcherStore((s) => s.selectedIndex);
  const previewsEnabled = useMruSwitcherStore((s) => s.previewsEnabled);
  const navigate = useMruSwitcherStore((s) => s.navigate);
  const close = useMruSwitcherStore((s) => s.close);

  useOverlay(isOpen);

  const profileId = useRuntimeStore((s) => s.currentProfileId);
  useEffect(() => {
    if (!isOpen || !previewsEnabled || !profileId) return;
    tabs.slice(0, 10).forEach((tab) => {
      const img = new Image();
      img.src = `vela-preview://${profileId}/${tab.id}`;
    });
  }, [isOpen, profileId, previewsEnabled, tabs]);

  const confirmSelected = useCallback(() => {
    if (!isOpen) return;
    const tab = tabs[selectedIndex];
    if (tab) void window.api.mru.confirm({ tabId: tab.id });
    close();
  }, [isOpen, tabs, selectedIndex, close]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === 'Control') confirmSelected();
      else if (e.key === 'Escape') close();
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      // Tab cycles the selection (safety net — before-input-event handles this
      // via tab.cycleMru when the shortcut table fires, but this ensures cycling
      // still works if that path is unavailable for any reason).
      if (e.key === 'Tab') {
        e.preventDefault();
        navigate(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); navigate(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); navigate(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); confirmSelected(); }
    };

    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, confirmSelected, navigate, close]);

  // Scroll track so the selected card is always centered.
  // With padding: 0 calc(50% - CARD_W/2), targetScrollLeft = selectedIndex * CARD_STRIDE.
  const trackRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (!isOpen) { firstRender.current = true; return; }
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({
      left: selectedIndex * CARD_STRIDE,
      behavior: firstRender.current ? 'instant' : 'smooth',
    });
    firstRender.current = false;
  }, [selectedIndex, isOpen]);

  if (!isOpen || tabs.length === 0) return null;

  const selectedTab = tabs[selectedIndex];
  const vertPad = Math.round(CARD_H * 0.1);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background: 'rgba(0,0,0,0.52)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        gap: 16,
      }}
      onClick={close}
    >
      {/* Horizontal card track */}
      <div
        ref={trackRef}
        className="mru-cycler-track w-full"
        style={{
          display: 'flex',
          gap: GAP,
          overflowX: 'auto',
          // Padding trick: left = calc(50% - CARD_W/2) ensures card n centers at scrollLeft = n * CARD_STRIDE
          padding: `${vertPad}px calc(50% - ${CARD_W / 2}px)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {tabs.map((tab, i) => (
          <MruPreview
            key={tab.id}
            tab={tab}
            isSelected={i === selectedIndex}
            previewsEnabled={previewsEnabled}
            onClick={() => { void window.api.mru.confirm({ tabId: tab.id }); close(); }}
          />
        ))}
      </div>

      {/* Footer pill: favicon + title + workspace + counter */}
      {selectedTab && (
        <div
          className="flex items-center gap-2 rounded-full px-4 py-2"
          style={{
            background: 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.1)',
            maxWidth: 520,
            minWidth: 240,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {selectedTab.favicon && (
            <img
              src={selectedTab.favicon}
              alt=""
              style={{ width: 15, height: 15, objectFit: 'contain', flexShrink: 0 }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <span
            className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]"
            style={{ color: 'rgba(255,255,255,0.9)' }}
          >
            {selectedTab.customTitle ?? selectedTab.originalTitle}
          </span>
          {selectedTab.workspaceName && (
            <span
              className="shrink-0 rounded px-2 py-0.5 text-[11px]"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
            >
              {selectedTab.workspaceName}
            </span>
          )}
          <span
            className="shrink-0 tabular-nums text-[12px]"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            {selectedIndex + 1} / {tabs.length}
          </span>
        </div>
      )}
    </div>
  );
}

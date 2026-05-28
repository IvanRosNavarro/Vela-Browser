import { useRef, useCallback, type CSSProperties } from 'react';
import { useLayoutStore } from '../../stores/layoutStore';
import { useUiStore, SIDEBAR_WIDTH_COMPACT } from '../../stores/uiStore';

// Sincronizado con TabManager.SPLIT_GAP y FOCUS_INDICATOR_H
const SPLIT_GAP = 4;
const FOCUS_INDICATOR_H = 2;

export function SplitResizer() {
  const layout = useLayoutStore((s) => s.layout);
  const setRatio = useLayoutStore((s) => s.setRatio);
  const commitRatio = useLayoutStore((s) => s.commitRatio);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarMode = useUiStore((s) => s.sidebarMode);
  const sidebarWidthNormal = useUiStore((s) => s.sidebarWidthNormal);
  const addressBarHeight = useUiStore((s) => s.addressBarEditing)
    ? 40 + 364
    : 40;

  const dragging = useRef(false);
  const startPos = useRef(0);
  const startRatio = useRef(0);

  const sidebarWidth = !sidebarOpen
    ? 0
    : sidebarMode === 'compact'
      ? SIDEBAR_WIDTH_COMPACT
      : sidebarWidthNormal;

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startRatio.current = layout.splitRatio;
      startPos.current = layout.mode === 'split-h' ? e.clientX : e.clientY;

      const onMove = (me: MouseEvent): void => {
        if (!dragging.current) return;
        const pos = layout.mode === 'split-h' ? me.clientX : me.clientY;
        const delta = pos - startPos.current;
        const contentSize =
          layout.mode === 'split-h'
            ? window.innerWidth - sidebarWidth
            : window.innerHeight - addressBarHeight;
        const newRatio = startRatio.current + delta / contentSize;
        setRatio(newRatio);
      };

      const onUp = (me: MouseEvent): void => {
        if (!dragging.current) return;
        dragging.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        const pos = layout.mode === 'split-h' ? me.clientX : me.clientY;
        const delta = pos - startPos.current;
        const contentSize =
          layout.mode === 'split-h'
            ? window.innerWidth - sidebarWidth
            : window.innerHeight - addressBarHeight;
        const finalRatio = startRatio.current + delta / contentSize;
        void commitRatio(finalRatio);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [layout.mode, layout.splitRatio, sidebarWidth, addressBarHeight, setRatio, commitRatio],
  );

  if (layout.mode === 'single') return null;

  const ratio = Math.max(0.2, Math.min(0.8, layout.splitRatio));
  const isH = layout.mode === 'split-h';

  let style: CSSProperties;

  if (isH) {
    const contentW = window.innerWidth - sidebarWidth;
    const leftW = contentW * ratio;
    style = {
      position: 'fixed',
      left: sidebarWidth + leftW - Math.floor(SPLIT_GAP / 2),
      top: addressBarHeight + FOCUS_INDICATOR_H,
      width: SPLIT_GAP,
      bottom: 0,
      cursor: 'col-resize',
      zIndex: 200,
      background: 'var(--vela-border)',
    };
  } else {
    const contentH = window.innerHeight - addressBarHeight;
    const topH = contentH * ratio;
    style = {
      position: 'fixed',
      left: sidebarWidth,
      right: 0,
      top: addressBarHeight + topH - Math.floor(SPLIT_GAP / 2),
      height: SPLIT_GAP,
      cursor: 'row-resize',
      zIndex: 200,
      background: 'var(--vela-border)',
    };
  }

  return (
    <div
      style={style}
      onMouseDown={onMouseDown}
    />
  );
}

// Indicadores de foco (barra de 2px en el top de cada panel activo)
export function SplitFocusIndicators() {
  const layout = useLayoutStore((s) => s.layout);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarMode = useUiStore((s) => s.sidebarMode);
  const sidebarWidthNormal = useUiStore((s) => s.sidebarWidthNormal);
  const addressBarEditing = useUiStore((s) => s.addressBarEditing);
  const addressBarHeight = addressBarEditing ? 40 + 364 : 40;

  if (layout.mode === 'single') return null;

  const sidebarWidth = !sidebarOpen
    ? 0
    : sidebarMode === 'compact'
      ? SIDEBAR_WIDTH_COMPACT
      : sidebarWidthNormal;

  const ratio = Math.max(0.2, Math.min(0.8, layout.splitRatio));
  const isH = layout.mode === 'split-h';
  const panelIds = isH ? (['left', 'right'] as const) : (['top', 'bottom'] as const);

  return (
    <>
      {panelIds.map((panelId) => {
        const isFocused = layout.focusedPanelId === panelId;
        const color = isFocused ? 'var(--vela-accent, #4f8ef7)' : 'transparent';

        let indStyle: CSSProperties;
        if (isH) {
          const contentW = window.innerWidth - sidebarWidth;
          const leftW = contentW * ratio - Math.ceil(SPLIT_GAP / 2);
          const rightX = sidebarWidth + leftW + SPLIT_GAP;
          const rightW = window.innerWidth - rightX;

          if (panelId === 'left') {
            indStyle = { position: 'fixed', left: sidebarWidth, top: addressBarHeight, width: Math.max(1, leftW), height: FOCUS_INDICATOR_H, background: color, zIndex: 199, pointerEvents: 'none' };
          } else {
            indStyle = { position: 'fixed', left: rightX, top: addressBarHeight, width: Math.max(1, rightW), height: FOCUS_INDICATOR_H, background: color, zIndex: 199, pointerEvents: 'none' };
          }
        } else {
          const contentH = window.innerHeight - addressBarHeight;
          const topH = contentH * ratio - Math.ceil(SPLIT_GAP / 2);
          const bottomY = addressBarHeight + topH + SPLIT_GAP;

          if (panelId === 'top') {
            indStyle = { position: 'fixed', left: sidebarWidth, top: addressBarHeight, right: 0, height: FOCUS_INDICATOR_H, background: color, zIndex: 199, pointerEvents: 'none' };
          } else {
            indStyle = { position: 'fixed', left: sidebarWidth, top: bottomY, right: 0, height: FOCUS_INDICATOR_H, background: color, zIndex: 199, pointerEvents: 'none' };
          }
        }

        return <div key={panelId} style={indStyle} />;
      })}
    </>
  );
}

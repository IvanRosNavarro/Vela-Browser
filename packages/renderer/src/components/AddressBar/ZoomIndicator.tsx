import { useCallback, useEffect, useRef, useState } from 'react';
import { IPC_EVENTS, URLBAR_ICON_LABELS } from '@vela/shared';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useUrlBarStore } from '../../stores/urlBarStore';
import { IconContextMenu } from './IconContextMenu';

interface Props {
  editing: boolean;
}

function isDefaultZoom(factor: number): boolean {
  return Math.abs(factor - 1) < 0.001;
}

/**
 * Indicador del zoom de página de la pestaña activa. Solo aparece cuando no
 * está al 100 %; al pulsarlo abre el popup nativo de zoom (−, %, +,
 * Restablecer). El factor lo manda el main (`state:tab-zoom-changed`) al
 * cambiarlo, al navegar y al activar una pestaña; además se consulta al
 * cambiar de pestaña por si el aviso llegó antes de montar la barra.
 */
export function ZoomIndicator({ editing }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabId = useRuntimeStore((s) =>
    currentWindowId !== null ? (s.activeTabIdByWindow[currentWindowId] ?? null) : null,
  );
  const isVisible = useUrlBarStore((s) => s.isVisible('zoom'));
  const setVisible = useUrlBarStore((s) => s.setVisible);
  const [factor, setFactor] = useState(1);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setFactor(1);
    if (!activeTabId) return;
    let cancelled = false;
    void window.api.zoom.get({ tabId: activeTabId }).then((res) => {
      if (!cancelled && res.ok) setFactor(res.data.factor);
    });
    const off = window.api.on(IPC_EVENTS.TAB_ZOOM_CHANGED, (payload) => {
      if (payload.tabId !== activeTabId) return;
      cancelled = true; // el aviso es más reciente que la consulta en vuelo
      setFactor(payload.factor);
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [activeTabId]);

  const handleClick = useCallback(() => {
    if (!btnRef.current || currentWindowId === null || !activeTabId) return;
    const rect = btnRef.current.getBoundingClientRect();
    void window.api.zoom.openPopup({
      windowId: currentWindowId,
      tabId: activeTabId,
      anchorRect: { right: rect.right, bottom: rect.bottom },
    });
  }, [currentWindowId, activeTabId]);

  if (editing || !activeTabId || !isVisible || isDefaultZoom(factor)) return null;

  const percent = Math.round(factor * 100);
  const label = `Zoom: ${percent} %`;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={`${label} · Clic para ajustar`}
        aria-label={label}
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setCtxMenu({ x: e.clientX, y: e.clientY });
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          height: 20,
          padding: '0 5px',
          border: '1px solid var(--vela-addressbar-border)',
          borderRadius: 4,
          background: 'transparent',
          color: 'var(--vela-addressbar-fg-muted)',
          fontSize: 10,
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--vela-bg-row-hover)';
          e.currentTarget.style.color = 'var(--vela-fg)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--vela-addressbar-fg-muted)';
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
          {factor > 1 && <line x1="11" y1="8" x2="11" y2="14" />}
        </svg>
        {percent} %
      </button>
      {ctxMenu && (
        <IconContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          iconLabel={URLBAR_ICON_LABELS['zoom']}
          onHide={() => void setVisible('zoom', false)}
          onSettings={() => void window.api.window.openUrlInNewTab({ url: 'vela://settings#appearance' })}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  );
}

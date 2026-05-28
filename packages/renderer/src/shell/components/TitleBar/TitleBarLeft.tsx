import type { CSSProperties } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useUiStore, SIDEBAR_WIDTH_COMPACT } from '../../../stores/uiStore';
import { useDownloadStore } from '../../../stores/downloadStore';
import { VelaMenuButton } from './VelaMenuButton';
import { DownloadButton } from './DownloadButton';

const PLATFORM = window.api.platform;

// PASO 4: en macOS los semáforos nativos ocupan ~70px desde el borde izquierdo.
// Empujamos todo el contenido de la izquierda para no solapar con ellos.
const DARWIN_TRAFFIC_LIGHT_CLEARANCE = 80;

export function TitleBarLeft() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarMode = useUiStore((s) => s.sidebarMode);
  const sidebarWidthNormal = useUiStore((s) => s.sidebarWidthNormal);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const hasDownloads = useDownloadStore((s) => s.items.length > 0);

  // Ancho efectivo del spacer = ancho actual del sidebar (0 si está oculto).
  const spacerWidth = !sidebarOpen
    ? 0
    : sidebarMode === 'compact'
      ? SIDEBAR_WIDTH_COMPACT
      : sidebarWidthNormal;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        WebkitAppRegion: 'no-drag',
        paddingLeft: PLATFORM === 'darwin' ? DARWIN_TRAFFIC_LIGHT_CLEARANCE : 0,
      } as CSSProperties}
    >
      <VelaMenuButton />

      {/* Separador vertical entre icono Vela y botón hamburguesa */}
      <div
        aria-hidden
        style={{
          width: 1,
          height: 16,
          background: 'var(--vela-border, rgba(255,255,255,0.1))',
          margin: '0 8px',
          flexShrink: 0,
        } as CSSProperties}
      />

      {/* Botón hamburguesa: siempre visible */}
      <button
        type="button"
        aria-label={sidebarOpen ? 'Ocultar barra lateral' : 'Mostrar barra lateral'}
        title={sidebarOpen ? 'Ocultar barra lateral' : 'Mostrar barra lateral'}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          border: 'none',
          borderRadius: 5,
          background: 'transparent',
          color: 'var(--vela-titlebar-fg-muted)',
          cursor: 'default',
          flexShrink: 0,
          WebkitAppRegion: 'no-drag',
          outline: 'none',
        } as CSSProperties}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-titlebar-button-hover-bg)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
        onFocus={(e) => { (e.currentTarget as HTMLButtonElement).style.outline = '2px solid var(--vela-accent)'; (e.currentTarget as HTMLButtonElement).style.outlineOffset = '-2px'; }}
        onBlur={(e) => { (e.currentTarget as HTMLButtonElement).style.outline = 'none'; }}
        onClick={() => void toggleSidebar()}
      >
        {sidebarOpen
          ? <PanelLeftClose size={16} strokeWidth={1.75} />
          : <PanelLeftOpen size={16} strokeWidth={1.75} />}
      </button>

      <DownloadButton />

      {/* Spacer: ocupa exactamente el ancho del sidebar para que la addressbar
          quede alineada con el inicio del área del WebContentsView */}
      {/* spacerWidth - VelaMenuButton(28) - separator(17) - hamburger(28) - divider(1) [- DownloadButton(28) si visible] */}
      {(() => {
        const fixed = 74 + (hasDownloads ? 28 : 0);
        return spacerWidth > fixed ? (
          <div style={{ width: spacerWidth - fixed, flexShrink: 0 } as CSSProperties} aria-hidden />
        ) : null;
      })()}
    </div>
  );
}

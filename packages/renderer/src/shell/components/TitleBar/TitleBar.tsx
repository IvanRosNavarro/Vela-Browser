import { useEffect, type CSSProperties } from 'react';
import { TitleBarLeft } from './TitleBarLeft';
import { TitleBarCenter } from './TitleBarCenter';
import { TitleBarRight } from './TitleBarRight';
import { useUiStore, SIDEBAR_WIDTH_COMPACT } from '../../../stores/uiStore';
import { useDeviceEmulationStore, DEVICE_TOOLBAR_HEIGHT } from '../../../stores/deviceEmulationStore';
import { call } from '../../../lib/ipc';

const TITLEBAR_HEIGHT = 32;
// Espacio extra que se reserva cuando la barra de direcciones está en modo
// edición: el WCV baja para que el dropdown de sugerencias (max 360px) quede
// completamente por encima de él y sea visible. 360 (maxHeight) + 4 (gap).
const SUGGEST_CLEARANCE = 364;
const PLATFORM = window.api.platform;

export function TitleBar() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sidebarMode = useUiStore((s) => s.sidebarMode);
  const sidebarWidthNormal = useUiStore((s) => s.sidebarWidthNormal);
  const isFullscreen = useUiStore((s) => s.isFullscreen);
  const addressBarEditing = useUiStore((s) => s.addressBarEditing);
  const theme = useUiStore((s) => s.theme);
  const deviceActive = useDeviceEmulationStore((s) => s.active);

  useEffect(() => {
    let h: number;
    if (isFullscreen) {
      h = 0;
    } else if (addressBarEditing) {
      h = TITLEBAR_HEIGHT + (deviceActive ? DEVICE_TOOLBAR_HEIGHT : 0) + SUGGEST_CLEARANCE;
    } else {
      h = TITLEBAR_HEIGHT + (deviceActive ? DEVICE_TOOLBAR_HEIGHT : 0);
    }
    void window.api.layout.setAddressBarHeight({ height: h });
  }, [isFullscreen, addressBarEditing, deviceActive]);

  useEffect(() => {
    const width = !sidebarOpen
      ? 0
      : sidebarMode === 'compact'
        ? SIDEBAR_WIDTH_COMPACT
        : sidebarWidthNormal;
    void window.api.layout.setSidebarWidth({ width });
  }, [sidebarOpen, sidebarMode, sidebarWidthNormal]);

  // PASO 1: sincroniza los colores del titleBarOverlay nativo con el tema activo.
  // Solo tiene efecto en Windows; en macOS/Linux es no-op (el handler lo ignora).
  useEffect(() => {
    if (PLATFORM !== 'win32') return;
    // requestAnimationFrame garantiza que el DOM ha repintado las CSS vars
    // tras el cambio de data-theme antes de leerlas.
    const id = requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement);
      const glassmorphismActive = style.getPropertyValue('--vela-html-bg').trim() === 'transparent';
      // Con glassmorphism activo el overlay DWM es transparente para que el acrílico pase.
      const color = glassmorphismActive
        ? '#00000000'
        : (style.getPropertyValue('--vela-titlebar-bg').trim() || '#1a1a1a');
      const symbolColor = style.getPropertyValue('--vela-titlebar-fg').trim() || '#e0e0e0';
      void call(() => window.api.window.updateTitleBarOverlay({ color, symbolColor }));
    });
    return () => cancelAnimationFrame(id);
  }, [theme]);

  // PASO 2: en fullscreen ocultamos completamente la barra.
  if (isFullscreen) return null;

  return (
    <header
      style={{
        height: TITLEBAR_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        background: 'color-mix(in srgb, var(--vela-titlebar-bg) calc(var(--sidebar-background-opacity, 1) * 100%), transparent)',
        backdropFilter: 'var(--sidebar-backdrop-filter, none)',
        WebkitBackdropFilter: 'var(--sidebar-backdrop-filter, none)',
        color: 'var(--vela-titlebar-fg)',
        userSelect: 'none',
        flexShrink: 0,
        WebkitAppRegion: 'drag',
        position: 'relative',
        zIndex: 100,
      } as CSSProperties}
    >
      <TitleBarLeft />
      {sidebarOpen && (
        <div
          aria-hidden
          style={{
            width: 1,
            alignSelf: 'stretch',
            background: 'var(--vela-border)',
            flexShrink: 0,
          }}
        />
      )}
      <TitleBarCenter />
      <TitleBarRight />
    </header>
  );
}

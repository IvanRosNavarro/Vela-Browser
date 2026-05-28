import type { CSSProperties } from 'react';
import { WindowControls } from './WindowControls';
import { useDeviceEmulationStore } from '../../../stores/deviceEmulationStore';
import { ExtensionActionsBar } from './ExtensionActionsBar';
import { SplitViewButton } from './SplitViewButton';
import { MediaButton } from './MediaButton';
import { SyncStatusButton } from './SyncStatusButton';
import { WindowsIndicator } from './WindowsIndicator';
import { FavoritesButton } from './FavoritesButton';
import { useTitleBarIconStore } from '../../../stores/titleBarIconStore';

export function TitleBarRight() {
  const active = useDeviceEmulationStore((s) => s.active);
  const activate = useDeviceEmulationStore((s) => s.activate);
  const deactivate = useDeviceEmulationStore((s) => s.deactivate);
  const iconConfig = useTitleBarIconStore((s) => s.iconConfig);
  const isVisible = (id: string) => iconConfig.find((c) => c.id === id)?.visible ?? true;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        WebkitAppRegion: 'no-drag',
        gap: 2,
        paddingRight: 4,
      } as CSSProperties}
    >
      <ExtensionActionsBar />
      {isVisible('favorites') && <FavoritesButton />}
      {isVisible('media') && <MediaButton />}
      {isVisible('windows') && <WindowsIndicator />}
      {isVisible('sync') && <SyncStatusButton />}
      {isVisible('split-view') && <SplitViewButton />}
      {isVisible('device-mode') && (
        <button
          title={active ? 'Salir del modo dispositivo' : 'Modo dispositivo (responsive)'}
          onClick={() => void (active ? deactivate() : activate())}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 5,
            border: 'none',
            background: active ? 'var(--vela-accent, #4f8ef7)' : 'transparent',
            color: active ? '#fff' : 'var(--vela-titlebar-fg)',
            cursor: 'pointer',
            opacity: active ? 1 : 0.65,
            flexShrink: 0,
            WebkitAppRegion: 'no-drag',
            padding: 0,
          } as CSSProperties}
        >
          {/* phone + tablet icon */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
            <line x1="12" y1="18" x2="12.01" y2="18" />
          </svg>
        </button>
      )}

      <WindowControls />
    </div>
  );
}

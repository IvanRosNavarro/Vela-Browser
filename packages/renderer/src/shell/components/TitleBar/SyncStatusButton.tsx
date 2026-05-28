import type { CSSProperties } from 'react';
import { useSyncStore } from '../../../stores/syncStore';

function openSyncSettings() {
  void window.api.window.openUrlInNewTab({ url: 'vela://settings#sync', activate: true });
}

export function SyncStatusButton() {
  const status = useSyncStore((s) => s.status);
  const sessionExpired = useSyncStore((s) => s.sessionExpired);

  if (!status.configured && !sessionExpired) return null;

  let opacity: number;
  let color: string;
  let title: string;
  let animation: string | undefined;

  if (sessionExpired) {
    opacity = 1.0;
    color = 'var(--vela-accent-danger, #e05252)';
    title = 'Sesión expirada. Abre Ajustes para reconectar.';
  } else if (status.syncInProgress) {
    opacity = 1.0;
    color = 'var(--vela-titlebar-fg)';
    title = 'Sincronizando...';
    animation = 'sync-pulse 1.5s ease-in-out infinite';
  } else if (!status.connected) {
    opacity = 0.7;
    color = 'var(--vela-accent-warning, #d4813a)';
    title = 'Sin conexión. Los cambios se sincronizarán al reconectar.';
  } else {
    opacity = 0.4;
    color = 'var(--vela-titlebar-fg)';
    title = 'Sincronización activa';
  }

  return (
    <>
      <style>{`
        @keyframes sync-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
      <button
        type="button"
        title={title}
        onClick={openSyncSettings}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 5,
          border: 'none',
          background: 'transparent',
          color,
          cursor: 'pointer',
          opacity,
          flexShrink: 0,
          WebkitAppRegion: 'no-drag',
          padding: 0,
          fontSize: 13,
          animation,
        } as CSSProperties}
      >
        <SyncIcon status={{ configured: status.configured, connected: status.connected, syncInProgress: status.syncInProgress }} expired={sessionExpired} />
      </button>
    </>
  );
}

function SyncIcon({ status, expired }: {
  status: { configured: boolean; connected: boolean; syncInProgress: boolean };
  expired: boolean;
}) {
  if (expired) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9" />
        <line x1="9" y1="18" x2="15" y2="18" />
        <line x1="12" y1="15" x2="12" y2="21" />
        <line x1="3" y1="3" x2="21" y2="21" />
      </svg>
    );
  }
  if (status.syncInProgress) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 16 12 12 8 16" />
        <line x1="12" y1="12" x2="12" y2="21" />
        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
      </svg>
    );
  }
  if (!status.connected) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 16.2A4.5 4.5 0 0 0 17.5 8h-1.8A7 7 0 1 0 4 14.9" />
        <line x1="3" y1="3" x2="21" y2="21" />
      </svg>
    );
  }
  // Conectado + sin cambios
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

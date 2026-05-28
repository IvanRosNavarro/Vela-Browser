import type { CSSProperties } from 'react';
import { useWorkspacesStore } from '../../stores/workspacesStore';
import { call } from '../../lib/ipc';

/**
 * Overlay a pantalla completa que aparece en una ventana secundaria cuando
 * aún no tiene workspace asignado. El usuario elige uno y la ventana lo adopta.
 */
export function WorkspaceSelector() {
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);

  if (activeWorkspaceId !== null) return null;

  async function handleSelect(workspaceId: string) {
    await call(() => window.api.window.setWorkspace({ workspaceId }));
    // El workspace activo se actualiza vía el evento ACTIVE_WORKSPACE_CHANGED
    // que emite TabManager al hacer setWorkspaceForWindow.
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--vela-bg-app, #0a0a0a)',
        color: 'var(--vela-fg, #e0e0e0)',
        gap: 24,
      } as CSSProperties}
    >
      <p style={{ fontSize: 14, opacity: 0.7, margin: 0 }}>
        Elige un workspace para esta ventana
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 12,
          maxWidth: 600,
          width: '100%',
          padding: '0 24px',
        } as CSSProperties}
      >
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            onClick={() => void handleSelect(ws.id)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 6,
              padding: '12px 14px',
              borderRadius: 8,
              border: '1px solid var(--vela-border, rgba(255,255,255,0.1))',
              background: 'var(--vela-bg-surface, #1c1f26)',
              color: 'inherit',
              cursor: 'pointer',
              textAlign: 'left',
              borderTop: `3px solid ${ws.color ?? 'var(--vela-accent, #4f8ef7)'}`,
              transition: 'opacity 0.1s',
            } as CSSProperties}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            <span style={{ fontSize: 13, fontWeight: 500 }}>{ws.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

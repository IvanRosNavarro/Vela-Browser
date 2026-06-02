import { Plus, Settings } from 'lucide-react';
import type { SidebarMode } from '@vela/shared';
import { call } from '../../lib/ipc';
import { ProfileSwitcher } from '../ProfileSwitcher';
import { useUiStore } from '../../stores/uiStore';
import { AddNodeMenu } from './AddNodeMenu';

const IS_BLINDED_WINDOW = window.api.init.isBlindedWindow;

interface SidebarFooterProps {
  mode: SidebarMode;
  onNewTab: () => void;
}

export function SidebarFooter({ mode, onNewTab }: SidebarFooterProps) {
  const compact = mode === 'compact';
  const setSidebarMode = useUiStore((s) => s.setSidebarMode);
  const newtabButtonPos = useUiStore((s) => s.newtabButtonPos);

  const onOpenSettings = (): void => {
    void call(() =>
      window.api.window.openUrlInNewTab({
        url: 'vela://settings',
        activate: true,
      }),
    );
  };

  const btnIcon: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: 'var(--vela-fg-muted)',
    cursor: 'pointer',
    width: 28,
    height: 28,
    flexShrink: 0,
  };

  return (
    <div
      className="shrink-0"
      style={{
        borderTop: '1px solid var(--vela-border)',
        padding: compact ? '6px 4px' : '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {/* Nueva pestaña — oculta en ventanas fantasma y cuando no está en footer */}
      {!IS_BLINDED_WINDOW && newtabButtonPos === 'footer' && (
        <button
          type="button"
          onClick={onNewTab}
          title="Nueva pestaña"
          aria-label="Nueva pestaña"
          className="hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: compact ? 32 : '100%',
            height: 28,
            padding: compact ? 0 : '0 4px',
            margin: compact ? '0 auto' : undefined,
            borderRadius: 6,
            border: 'none',
            background: 'transparent',
            color: 'var(--vela-fg-muted)',
            cursor: 'pointer',
            fontSize: 13,
            justifyContent: compact ? 'center' : 'flex-start',
          }}
        >
          <Plus size={14} style={{ flexShrink: 0 }} />
          {!compact && <span style={{ fontSize: 11 }}>Nueva pestaña</span>}
        </button>
      )}

      {/* Botones: Añadir + Colapsar [+ Ajustes si no es fantasma] */}
      <div style={{
        display: 'flex',
        flexDirection: compact ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? 2 : 4,
      }}>
        <AddNodeMenu parentId={null} compact={compact} />

        <button
          type="button"
          aria-label={compact ? 'Expandir sidebar' : 'Colapsar sidebar'}
          title={compact ? 'Expandir sidebar' : 'Colapsar sidebar'}
          onClick={() => void setSidebarMode(compact ? 'normal' : 'compact')}
          className="hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
          style={{ ...btnIcon, fontSize: 14 }}
        >
          {compact ? '»' : '«'}
        </button>

        {!IS_BLINDED_WINDOW && (
          <button
            type="button"
            onClick={onOpenSettings}
            title="Ajustes (Ctrl+,)"
            aria-label="Abrir ajustes"
            className="hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
            style={btnIcon}
          >
            <Settings size={14} />
          </button>
        )}
      </div>

      {/* Perfil activo — oculto en ventanas fantasma */}
      {!IS_BLINDED_WINDOW && <ProfileSwitcher />}
    </div>
  );
}

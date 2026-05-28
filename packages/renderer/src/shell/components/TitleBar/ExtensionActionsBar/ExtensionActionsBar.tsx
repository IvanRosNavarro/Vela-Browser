import { useState, useRef, useCallback, useEffect, type CSSProperties } from 'react';
import type { ExtensionAction, ExtensionAnchorRect } from '@vela/shared';
import { Settings2 } from 'lucide-react';
import { useExtensionActionsStore } from '../../../../stores/extensionActionsStore';
import { ExtensionActionButton } from './ExtensionActionButton';

const MAX_VISIBLE = 8;

export function ExtensionActionsBar() {
  const actions = useExtensionActionsStore((s) => s.actions);
  const loaded = useExtensionActionsStore((s) => s.loaded);
  const openPopup = useExtensionActionsStore((s) => s.openPopup);

  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const hasOverflow = actions.length > MAX_VISIBLE;
  const visible = hasOverflow ? actions.slice(0, MAX_VISIBLE - 1) : actions;
  const hidden = hasOverflow ? actions.slice(MAX_VISIBLE - 1) : [];

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    if (!overflowOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (
        overflowRef.current &&
        !overflowRef.current.contains(e.target as Node) &&
        moreButtonRef.current &&
        !moreButtonRef.current.contains(e.target as Node)
      ) {
        setOverflowOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [overflowOpen]);

  const handleOverflowItemClick = useCallback(
    (action: ExtensionAction) => {
      setOverflowOpen(false);
      if (!action.enabled || !moreButtonRef.current) return;
      const rect = moreButtonRef.current.getBoundingClientRect();
      const anchorRect: ExtensionAnchorRect = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
      void openPopup(action.extensionId, anchorRect);
    },
    [openPopup],
  );

  const handleOpenManager = useCallback(async () => {
    await window.api.commands.execute('internal.openExtensions');
  }, []);

  if (!loaded || actions.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        flexShrink: 0,
        WebkitAppRegion: 'no-drag',
        position: 'relative',
      } as CSSProperties}
    >
      {visible.map((action) => (
        <ExtensionActionButton key={action.extensionId} action={action} />
      ))}

      {/* Manage button */}
      <button
        onClick={() => void handleOpenManager()}
        title="Gestionar extensiones"
        className="transition-colors"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          borderRadius: 'var(--vela-radius-sm, 4px)',
          border: 'none',
          background: 'transparent',
          color: 'var(--vela-titlebar-fg-muted, rgba(128,128,128,0.7))',
          cursor: 'pointer',
          flexShrink: 0,
          padding: 0,
          WebkitAppRegion: 'no-drag',
        } as CSSProperties}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            'var(--vela-titlebar-button-hover-bg, rgba(128,128,128,0.15))';
          (e.currentTarget as HTMLButtonElement).style.color =
            'var(--vela-titlebar-fg, currentColor)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color =
            'var(--vela-titlebar-fg-muted, rgba(128,128,128,0.7))';
        }}
      >
        <Settings2 size={14} />
      </button>

      {hasOverflow && (
        <>
          <button
            ref={moreButtonRef}
            title="Más extensiones"
            onClick={() => setOverflowOpen((o) => !o)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 'var(--vela-radius-sm, 4px)',
              border: 'none',
              background: overflowOpen
                ? 'var(--vela-titlebar-button-hover-bg, rgba(128,128,128,0.15))'
                : 'transparent',
              color: 'var(--vela-titlebar-fg, currentColor)',
              cursor: 'pointer',
              flexShrink: 0,
              padding: 0,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1,
              WebkitAppRegion: 'no-drag',
            } as CSSProperties}
          >
            •••
          </button>

          {overflowOpen && (
            <OverflowDropdown
              ref={overflowRef}
              actions={hidden}
              onSelect={handleOverflowItemClick}
            />
          )}
        </>
      )}

      {/* Separador visual entre extensiones y el resto de controles del TitleBar */}
      <div
        aria-hidden
        style={{
          width: 1,
          height: 16,
          background: 'var(--vela-border, rgba(255,255,255,0.1))',
          margin: '0 4px',
          flexShrink: 0,
        } as CSSProperties}
      />
    </div>
  );
}

import { forwardRef } from 'react';

const OverflowDropdown = forwardRef<
  HTMLDivElement,
  { actions: ExtensionAction[]; onSelect(action: ExtensionAction): void }
>(function OverflowDropdown({ actions, onSelect }, ref) {
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 4,
        minWidth: 200,
        background: 'var(--vela-surface-overlay, var(--vela-bg, #fff))',
        border: '1px solid var(--vela-border, rgba(0,0,0,0.12))',
        borderRadius: 'var(--vela-radius-md, 6px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        zIndex: 9999,
        overflow: 'hidden',
        WebkitAppRegion: 'no-drag',
      } as CSSProperties}
    >
      {actions.map((action) => (
        <button
          key={action.extensionId}
          title={action.title}
          onClick={() => onSelect(action)}
          disabled={!action.enabled}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '6px 12px',
            border: 'none',
            background: 'transparent',
            cursor: action.enabled ? 'pointer' : 'default',
            opacity: action.enabled ? 1 : 0.4,
            textAlign: 'left',
            color: 'var(--vela-fg, inherit)',
            fontSize: 13,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          } as CSSProperties}
          onMouseEnter={(e) => {
            if (!action.enabled) return;
            (e.currentTarget as HTMLButtonElement).style.background =
              'var(--vela-surface-hover, rgba(128,128,128,0.1))';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          {action.iconDataUrl ? (
            <img
              src={action.iconDataUrl}
              alt=""
              width={16}
              height={16}
              style={{ flexShrink: 0 }}
              draggable={false}
            />
          ) : (
            <span style={{ width: 16, flexShrink: 0 }} />
          )}
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {action.title}
          </span>
        </button>
      ))}
    </div>
  );
});

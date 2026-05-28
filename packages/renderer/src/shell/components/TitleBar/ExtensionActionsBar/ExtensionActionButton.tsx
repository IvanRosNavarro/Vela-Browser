import type { CSSProperties } from 'react';
import type { ExtensionAction, ExtensionAnchorRect } from '@vela/shared';
import { useExtensionActionsStore } from '../../../../stores/extensionActionsStore';

interface Props {
  action: ExtensionAction;
}

export function ExtensionActionButton({ action }: Props) {
  const openPopup = useExtensionActionsStore((s) => s.openPopup);

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!action.enabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const anchorRect: ExtensionAnchorRect = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
    void openPopup(action.extensionId, anchorRect);
  }

  const hasBadge = action.badgeText.length > 0;

  return (
    <button
      title={action.title}
      onClick={handleClick}
      disabled={!action.enabled}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 'var(--vela-radius-sm, 4px)',
        border: 'none',
        background: 'transparent',
        cursor: action.enabled ? 'pointer' : 'default',
        opacity: action.enabled ? 1 : 0.4,
        flexShrink: 0,
        padding: 0,
        WebkitAppRegion: 'no-drag',
        pointerEvents: action.enabled ? 'auto' : 'none',
      } as CSSProperties}
      onMouseEnter={(e) => {
        if (!action.enabled) return;
        (e.currentTarget as HTMLButtonElement).style.background =
          'var(--vela-titlebar-button-hover-bg, rgba(128,128,128,0.15))';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
      onMouseDown={(e) => {
        if (!action.enabled) return;
        (e.currentTarget as HTMLButtonElement).style.background =
          'var(--vela-titlebar-button-active-bg, rgba(128,128,128,0.25))';
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          'var(--vela-titlebar-button-hover-bg, rgba(128,128,128,0.15))';
      }}
    >
      {/* Icono */}
      {action.iconDataUrl ? (
        <img
          src={action.iconDataUrl}
          alt={action.title}
          width={16}
          height={16}
          style={{ display: 'block', imageRendering: 'auto' }}
          draggable={false}
        />
      ) : (
        <PuzzleIcon />
      )}

      {/* Badge */}
      {hasBadge && (
        <span
          style={{
            position: 'absolute',
            top: 1,
            right: 1,
            minWidth: 14,
            height: 14,
            padding: '0 2px',
            borderRadius: 7,
            background: action.badgeBackgroundColor ?? 'var(--vela-danger, #e05252)',
            color: '#fff',
            fontSize: 9,
            fontWeight: 600,
            lineHeight: '14px',
            textAlign: 'center',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {action.badgeText.length > 4 ? action.badgeText.slice(0, 4) : action.badgeText}
        </span>
      )}
    </button>
  );
}

function PuzzleIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: 'var(--vela-titlebar-fg, currentColor)', opacity: 0.7 }}
    >
      <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.69a.979.979 0 0 1 .837-.276c.47.07.802.48.968.925a2.501 2.501 0 1 0 3.214-3.214c-.446-.166-.855-.497-.925-.968a.979.979 0 0 1 .276-.837l1.61-1.61a2.402 2.402 0 0 1 1.705-.707 2.402 2.402 0 0 1 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02z" />
    </svg>
  );
}

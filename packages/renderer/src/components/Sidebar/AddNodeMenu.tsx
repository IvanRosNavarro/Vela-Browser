import { useCallback, useRef } from 'react';
import { useWorkspacesStore } from '../../stores/workspacesStore';
import { useRuntimeStore } from '../../stores/runtimeStore';

interface AddNodeMenuProps {
  parentId?: string | null;
  compact?: boolean;
}

export function AddNodeMenu({ parentId = null, compact = false }: AddNodeMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const workspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);

  const handleClick = useCallback(() => {
    if (!triggerRef.current || !workspaceId || currentWindowId === null) return;
    const rect = triggerRef.current.getBoundingClientRect();
    void window.api.addNodeMenu.open({
      windowId: currentWindowId,
      anchorRect: { left: rect.left, bottom: rect.bottom },
      workspaceId,
      parentId,
      itemCount: window.api.init.isBlindedWindow ? 2 : 4,
    });
  }, [workspaceId, currentWindowId, parentId]);

  if (!workspaceId) return null;

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={handleClick}
      title="Añadir"
      className="flex items-center justify-center rounded-md text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
      style={{
        width: compact ? 32 : 28,
        height: compact ? 32 : 28,
        fontSize: 18,
        lineHeight: 1,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
      }}
    >
      +
    </button>
  );
}

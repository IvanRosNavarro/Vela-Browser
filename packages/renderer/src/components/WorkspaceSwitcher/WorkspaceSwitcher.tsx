import { useCallback, useRef } from 'react';
import { useUiStore, useWorkspacesStore } from '../../stores';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { WorkspaceIcon } from './WorkspaceIcon';

export function WorkspaceSwitcher() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const activeId = useWorkspacesStore((s) => s.activeWorkspaceId);
  const sidebarMode = useUiStore((s) => s.sidebarMode);
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const compact = sidebarMode === 'compact';

  const active = workspaces.find((w) => w.id === activeId);

  const handleOpen = useCallback(() => {
    if (!triggerRef.current || currentWindowId === null) return;
    const rect = triggerRef.current.getBoundingClientRect();
    void window.api.workspaceDrop.open({
      windowId: currentWindowId,
      anchorRect: { left: rect.left, bottom: rect.bottom },
      workspaceCount: workspaces.length,
    });
  }, [currentWindowId, workspaces.length]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={handleOpen}
        aria-haspopup="menu"
        title={active?.name ?? 'Workspace'}
        className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-[var(--vela-bg-row-hover)]"
      >
        <WorkspaceIcon
          icon={active?.icon}
          fallbackName={active?.name ?? 'W'}
          background={active?.color ?? null}
          size={24}
        />
        {!compact && (
          <>
            <span className="flex-1 truncate text-[13px] font-semibold text-[var(--vela-fg)]">
              {active?.name ?? 'Sin workspace'}
            </span>
            <span
              aria-hidden
              className="text-[10px] text-[var(--vela-fg-muted)]"
            >
              ▾
            </span>
          </>
        )}
      </button>
    </div>
  );
}

import { useUiStore } from '../../stores/uiStore';
import { WorkspaceSwitcher } from '../WorkspaceSwitcher';

export function WorkspaceHeader() {
  const sidebarMode = useUiStore((s) => s.sidebarMode);
  const compact = sidebarMode === 'compact';

  if (compact) {
    return (
      <div
        className="flex shrink-0 flex-col border-b"
        style={{ borderColor: 'var(--vela-border)' }}
      >
        <div className="flex items-center justify-center px-1 py-1">
          <WorkspaceSwitcher />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex shrink-0 items-center gap-1 border-b px-2 py-1"
      style={{ borderColor: 'var(--vela-border)' }}
    >
      <div className="min-w-0 flex-1">
        <WorkspaceSwitcher />
      </div>
    </div>
  );
}

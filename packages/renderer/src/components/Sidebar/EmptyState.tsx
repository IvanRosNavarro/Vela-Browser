import { call } from '../../lib/ipc';
import { useAddressBarStore } from '../../stores/addressBarStore';
import { useTreeStore } from '../../stores/treeStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';

export function EmptyState() {
  const workspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);
  const createFolder = useTreeStore((s) => s.createFolder);

  if (!workspaceId) return null;

  function onNewTab() {
    void call(() =>
      window.api.window.openUrlInNewTab({
        url: 'vela://newtab',
        parentId: null,
        activate: true,
      }),
    ).then(() => {
      setTimeout(() => useAddressBarStore.getState().requestFocus(), 0);
    });
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm text-[var(--vela-fg-muted)]">
        Este espacio está vacío
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-[var(--vela-bg-row-hover)]"
          style={{ borderColor: 'var(--vela-border)' }}
          onClick={onNewTab}
        >
          Nueva pestaña
        </button>
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-[var(--vela-bg-row-hover)]"
          style={{ borderColor: 'var(--vela-border)' }}
          onClick={() =>
            void createFolder({
              workspaceId,
              parentId: null,
              name: 'Carpeta',
            })
          }
        >
          Nueva carpeta
        </button>
      </div>
    </div>
  );
}

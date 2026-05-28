import { useEffect, useMemo } from 'react';
import { useResourcesStore } from '../../../stores/resourcesStore';
import { useOverlayStore } from '../../../stores/overlayStore';
import { useRuntimeStore } from '../../../stores/runtimeStore';
import { ResourcesHeader } from './ResourcesHeader';
import { ResourcesRow } from './ResourcesRow';

export function ResourcesModal() {
  const isOpen = useResourcesStore((s) => s.isOpen);
  const resources = useResourcesStore((s) => s.resources);
  const totalMemoryMb = useResourcesStore((s) => s.totalMemoryMb);
  const close = useResourcesStore((s) => s.close);

  const acquire = useOverlayStore((s) => s.acquire);
  const release = useOverlayStore((s) => s.release);

  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabIdByWindow = useRuntimeStore((s) => s.activeTabIdByWindow);
  const activeTabId = currentWindowId !== null ? (activeTabIdByWindow[currentWindowId] ?? null) : null;

  useEffect(() => {
    if (!isOpen) return;
    acquire();
    return () => { release(); };
  }, [isOpen, acquire, release]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  // Map PID → count of tabs sharing that PID
  const pidCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of resources) {
      if (r.pid !== null) map.set(r.pid, (map.get(r.pid) ?? 0) + 1);
    }
    return map;
  }, [resources]);

  const maxRss = useMemo(() => Math.max(...resources.map((r) => r.memoryRss), 0), [resources]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={close}
      />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-1/2 z-50 flex w-[680px] max-h-[80vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-[var(--vela-border)] shadow-2xl"
        style={{
          background: 'color-mix(in srgb, var(--vela-bg-surface) calc(var(--sidebar-background-opacity, 1) * 100%), transparent)',
          backdropFilter: 'var(--sidebar-backdrop-filter, blur(20px))',
          animation: 'vela-modal-in 150ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <ResourcesHeader totalMemoryMb={totalMemoryMb} onClose={close} />

        {/* Rows */}
        <div className="flex-1 overflow-y-auto py-1">
          {resources.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[var(--vela-fg-muted)]">
              No hay pestañas activas
            </p>
          ) : (
            resources.map((r) => (
              <ResourcesRow
                key={r.tabId}
                resource={r}
                maxRss={maxRss}
                activeTabId={activeTabId}
                sharedPidCount={r.pid !== null ? (pidCounts.get(r.pid) ?? 1) : 1}
              />
            ))
          )}
        </div>
      </div>

      <style>{`
        @keyframes vela-modal-in {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.95); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </>
  );
}

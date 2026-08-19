import { useEffect, useMemo } from 'react';
import { useResourcesStore } from '../../../stores/resourcesStore';
import { useOverlayStore } from '../../../stores/overlayStore';
import { useRuntimeStore } from '../../../stores/runtimeStore';
import { ResourcesHeader } from './ResourcesHeader';
import { ResourcesRow } from './ResourcesRow';
import { ResourcesProcessRow } from './ResourcesProcessRow';

export function ResourcesModal() {
  const isOpen = useResourcesStore((s) => s.isOpen);
  const resources = useResourcesStore((s) => s.resources);
  const otherProcesses = useResourcesStore((s) => s.otherProcesses);
  const totalMemoryMb = useResourcesStore((s) => s.totalMemoryMb);
  const processCount = useResourcesStore((s) => s.processCount);
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

  // Escala compartida por ambas listas: si un proceso de fondo consume mucho
  // más que cualquier pestaña, las barras deben reflejarlo.
  const maxRss = useMemo(
    () => Math.max(0, ...resources.map((r) => r.memoryRss), ...otherProcesses.map((p) => p.memoryRss)),
    [resources, otherProcesses],
  );

  const tabsMemoryMb = useMemo(() => {
    // Sumar por PID: varias pestañas pueden compartir un mismo renderer.
    const seen = new Set<number>();
    let kb = 0;
    for (const r of resources) {
      if (r.pid === null) continue;
      if (seen.has(r.pid)) continue;
      seen.add(r.pid);
      kb += r.memoryRss;
    }
    return kb / 1024;
  }, [resources]);

  const otherMemoryMb = useMemo(
    () => otherProcesses.reduce((sum, p) => sum + p.memoryRss, 0) / 1024,
    [otherProcesses],
  );

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
        <ResourcesHeader
          totalMemoryMb={totalMemoryMb}
          processCount={processCount}
          tabsMemoryMb={tabsMemoryMb}
          otherMemoryMb={otherMemoryMb}
          onClose={close}
        />

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

          {otherProcesses.length > 0 && (
            <>
              <div className="mt-2 border-t border-[var(--vela-border)] px-4 pb-1 pt-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--vela-fg-muted)]">
                  Otros procesos
                </h3>
                <p className="mt-0.5 text-[10px] text-[var(--vela-fg-muted)]">
                  Proceso principal, GPU, servicios y renderers que no son pestañas de este perfil
                </p>
              </div>
              {otherProcesses.map((p) => (
                <ResourcesProcessRow key={p.pid} process={p} maxRss={maxRss} />
              ))}
            </>
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

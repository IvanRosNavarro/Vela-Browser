import { useMemo } from 'react';
import { X, Pause } from 'lucide-react';
import type { TabResource } from '@vela/shared';
import { call } from '../../../lib/ipc';

interface Props {
  resource: TabResource;
  maxRss: number;
  /** tabId of the currently active tab in this window */
  activeTabId: string | null;
  /** Number of tabs sharing the same PID (including this one). */
  sharedPidCount: number;
}

function barColor(pct: number): string {
  if (pct < 50) return 'var(--vela-success, #22c55e)';
  if (pct < 80) return '#eab308';
  return '#ef4444';
}

export function ResourcesRow({ resource, maxRss, activeTabId, sharedPidCount }: Props) {
  const pct = maxRss > 0 ? (resource.memoryRss / maxRss) * 100 : 0;
  const mbValue = resource.memoryRss / 1024;
  const mb = mbValue >= 1024 ? `${(mbValue / 1024).toFixed(2)} GB` : `${mbValue.toFixed(1)} MB`;
  const isDiscarded = resource.status === 'discarded';
  const isActive = resource.tabId === activeTabId;

  const canDiscard = !isDiscarded && !isActive;

  async function handleDiscard() {
    if (!canDiscard) return;
    try {
      await call(() => window.api.discard.discardTab({ tabId: resource.tabId }));
    } catch { /* ignore */ }
  }

  async function handleClose() {
    try {
      await call(() => window.api.tab.close({ id: resource.tabId }));
    } catch { /* ignore */ }
  }

  const favicon = useMemo(() => {
    if (!resource.favicon) return null;
    if (resource.favicon.startsWith('data:') || resource.favicon.startsWith('http')) {
      return resource.favicon;
    }
    return null;
  }, [resource.favicon]);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--vela-border)]/20">
      {/* Favicon */}
      <div className="flex h-4 w-4 shrink-0 items-center justify-center">
        {favicon ? (
          <img src={favicon} alt="" className="h-4 w-4 rounded-sm object-contain" />
        ) : (
          <div className="h-3 w-3 rounded-sm bg-[var(--vela-border)]" />
        )}
      </div>

      {/* Title + workspace badge */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs text-[var(--vela-fg)]" title={resource.title}>
            {resource.title || resource.url}
          </span>
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={{
              background: resource.workspaceColor ? `${resource.workspaceColor}22` : 'var(--vela-border)',
              color: resource.workspaceColor ?? 'var(--vela-fg-muted)',
            }}
          >
            {resource.workspaceName}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 flex-1 rounded-full bg-[var(--vela-border)]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: barColor(pct) }}
            />
          </div>
          <span
            className="w-16 shrink-0 text-right text-[10px] text-[var(--vela-fg-muted)]"
            title={
              isDiscarded
                ? 'Pestaña suspendida: no tiene proceso'
                : !resource.memoryKnown
                  ? 'Su proceso no aparece en las métricas de la aplicación'
                  : undefined
            }
          >
            {isDiscarded ? 'Suspendida' : !resource.memoryKnown ? '—' : mb}
          </span>
        </div>
      </div>

      {/* PID + shared indicator */}
      <div className="flex shrink-0 items-center gap-1">
        {resource.pid !== null && (
          <span
            className="text-[10px] text-[var(--vela-fg-muted)]"
            title={`PID ${resource.pid}`}
          >
            {resource.pid}
          </span>
        )}
        {sharedPidCount > 1 && resource.pid !== null && (
          <span
            className="h-2 w-2 rounded-full bg-orange-400"
            title={`Comparte proceso con ${sharedPidCount} pestañas`}
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => void handleDiscard()}
          disabled={!canDiscard}
          className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-[var(--vela-fg-muted)] transition-colors hover:bg-[var(--vela-border)] hover:text-[var(--vela-fg)] disabled:cursor-not-allowed disabled:opacity-30"
          title={isActive ? 'Tab activa — no se puede suspender' : isDiscarded ? 'Ya suspendida' : 'Suspender'}
        >
          <Pause className="h-3 w-3" />
          Suspender
        </button>
        <button
          onClick={() => void handleClose()}
          className="rounded p-1 text-[var(--vela-fg-muted)] transition-colors hover:bg-red-500/10 hover:text-red-400"
          title="Cerrar pestaña"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

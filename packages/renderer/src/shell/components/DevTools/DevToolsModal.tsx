import { useEffect, useCallback } from 'react';
import { useDevToolsStore, type DevToolsPanel } from '../../../stores/devtoolsStore';
import { useOverlayStore } from '../../../stores/overlayStore';
import { ColorPicker } from './ColorPicker';
import { JsonFormatter } from './JsonFormatter';
import { RegexTester } from './RegexTester';
import { TextDiff } from './TextDiff';
import { Converters } from './Converters';

interface PanelMeta { title: string; wide?: boolean; tall?: boolean }
const PANEL_META: Record<DevToolsPanel, PanelMeta> = {
  'color-picker':    { title: 'Pick de color' },
  'json-formatter':  { title: 'Formateador JSON', wide: true, tall: true },
  'regex-tester':    { title: 'Regex Tester', wide: true, tall: true },
  'text-diff':       { title: 'Diff de texto', wide: true, tall: true },
  'converters':      { title: 'Conversores', wide: true, tall: true },
};

export function DevToolsModal() {
  const activePanel = useDevToolsStore((s) => s.activePanel);
  const close = useDevToolsStore((s) => s.close);
  const acquire = useOverlayStore((s) => s.acquire);
  const release = useOverlayStore((s) => s.release);

  useEffect(() => {
    if (!activePanel) return;
    acquire();
    return () => { release(); };
  }, [activePanel, acquire, release]);

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  }, [close]);

  useEffect(() => {
    if (!activePanel) return;
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePanel, onKeyDown]);

  if (!activePanel) return null;

  const meta = PANEL_META[activePanel];
  const modalWidth = meta.wide ? 920 : 380;
  const modalHeight = meta.tall ? '75vh' : undefined;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={close} />

      {/* Modal */}
      <div
        className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 flex flex-col overflow-hidden rounded-xl border border-[var(--vela-border)] shadow-2xl"
        style={{
          width: modalWidth,
          ...(modalHeight ? { height: modalHeight } : {}),
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 80px)',
          background: 'color-mix(in srgb, var(--vela-bg-surface) calc(var(--sidebar-background-opacity, 1) * 100%), transparent)',
          backdropFilter: 'var(--sidebar-backdrop-filter, blur(20px))',
          animation: 'vela-devtools-in 150ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--vela-border)] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--vela-fg-muted)] uppercase tracking-wider">Dev</span>
            <span className="text-[var(--vela-fg-muted)]">/</span>
            <h2 className="text-sm font-semibold text-[var(--vela-fg)]">{meta.title}</h2>
          </div>
          <button
            className="text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)] w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--vela-bg-hover)] transition-colors text-sm"
            onClick={close}
            aria-label="Cerrar"
          >✕</button>
        </div>

        {/* Body — fills all remaining height */}
        <div className="flex-1 overflow-y-auto p-5" style={{ minHeight: 0 }}>
          {activePanel === 'color-picker'   && <ColorPicker />}
          {activePanel === 'json-formatter' && <JsonFormatter />}
          {activePanel === 'regex-tester'   && <RegexTester />}
          {activePanel === 'text-diff'      && <TextDiff />}
          {activePanel === 'converters'     && <Converters />}
        </div>
      </div>

      <style>{`
        @keyframes vela-devtools-in {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </>
  );
}

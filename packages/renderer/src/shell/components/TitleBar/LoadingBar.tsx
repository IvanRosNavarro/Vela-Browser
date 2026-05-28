import { useRuntimeStore } from '../../../stores/runtimeStore';

export function LoadingBar() {
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabId = useRuntimeStore((s) =>
    currentWindowId !== null ? (s.activeTabIdByWindow[currentWindowId] ?? null) : null,
  );
  const isLoading = useRuntimeStore((s) =>
    activeTabId !== null ? (s.loadingByTabId[activeTabId] ?? false) : false,
  );

  if (!isLoading) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 2,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: '45%',
          background: 'linear-gradient(90deg, transparent, var(--vela-accent), transparent)',
          animation: 'vela-loading-bar 1.2s ease-in-out infinite',
        }}
      />
    </div>
  );
}

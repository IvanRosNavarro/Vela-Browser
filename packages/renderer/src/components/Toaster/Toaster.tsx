import { useToastStore, type Toast } from '../../stores/toastStore';

const VARIANT_STYLES: Record<Toast['variant'], React.CSSProperties> = {
  info: {
    background: 'var(--vela-bg-sidebar-elev)',
    color: 'var(--vela-fg)',
    borderColor: 'var(--vela-border)',
  },
  success: {
    background: 'rgba(34, 197, 94, 0.12)',
    color: '#86efac',
    borderColor: 'rgba(34, 197, 94, 0.4)',
  },
  warning: {
    background: 'rgba(234, 179, 8, 0.12)',
    color: '#fde68a',
    borderColor: 'rgba(234, 179, 8, 0.4)',
  },
  error: {
    background: 'rgba(239, 68, 68, 0.12)',
    color: '#fca5a5',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => { t.onClick?.(); dismiss(t.id); }}
          className="pointer-events-auto cursor-pointer rounded border px-3 py-2 text-[12px] shadow-lg"
          style={VARIANT_STYLES[t.variant]}
        >
          {t.message}
          {t.onClick && (
            <span style={{ marginLeft: 6, opacity: 0.7, fontSize: 11 }}>↗</span>
          )}
        </div>
      ))}
    </div>
  );
}

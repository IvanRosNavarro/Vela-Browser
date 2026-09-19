import { useEffect, useRef } from 'react';

export interface ConfirmAction {
  id: string;
  label: string;
  /** Acción destructiva: se pinta en rojo. */
  danger?: boolean;
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  actions: ConfirmAction[];
  onSelect: (actionId: string) => void;
  onCancel: () => void;
}

/**
 * Diálogo de confirmación dentro de la página (las páginas internas son un
 * WebContentsView propio: no hay nada nativo encima que lo tape). Escape o
 * clic fuera cancelan. Sustituye a `window.confirm`.
 */
export function ConfirmDialog({ title, message, actions, onSelect, onCancel }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
    >
      <div style={{
        background: 'var(--vela-bg-surface)', color: 'var(--vela-fg)',
        border: '1px solid var(--vela-border)', borderRadius: 10,
        padding: 20, width: 'min(440px, calc(100vw - 32px))',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--vela-fg-muted)', lineHeight: 1.45 }}>{message}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--vela-border)', background: 'transparent', color: 'var(--vela-fg)', fontSize: 13, cursor: 'default' }}
          >
            Cancelar
          </button>
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(a.id)}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'default', fontWeight: 500,
                border: `1px solid ${a.danger ? 'var(--vela-insecure, #e05c5c)' : 'var(--vela-accent)'}`,
                background: a.danger ? 'var(--vela-insecure, #e05c5c)' : 'var(--vela-accent)',
                color: '#fff',
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

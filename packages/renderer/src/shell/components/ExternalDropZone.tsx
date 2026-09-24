import type { ReactNode } from 'react';
import { useExternalDrop } from '../hooks/useExternalDrop';

interface Props {
  children: ReactNode;
}

/**
 * Envuelve una parte de la chrome (sidebar, barra de título) para que acepte
 * enlaces, ficheros y texto arrastrados desde fuera de Vela.
 *
 * El envoltorio usa `display: contents`: no genera caja propia, así que no toca
 * el layout de lo que envuelve, y los eventos de arrastre le llegan igual por
 * burbujeo desde los hijos. El aviso de «suelta aquí» se pinta aparte, fijo
 * sobre la sidebar — que es HTML de la shell, no el WebContentsView, donde no
 * se vería.
 */
export function ExternalDropZone({ children }: Props) {
  const { isOver, dropProps } = useExternalDrop();

  return (
    <div style={{ display: 'contents' }} {...dropProps}>
      {children}
      {isOver && (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            top: 8,
            left: 8,
            zIndex: 60,
            pointerEvents: 'none',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--vela-fg)',
            background: 'var(--vela-bg-surface)',
            border: '1px solid var(--vela-accent)',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.35)',
          }}
        >
          Suelta para abrir en una pestaña
        </div>
      )}
    </div>
  );
}

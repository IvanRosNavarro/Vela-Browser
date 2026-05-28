import { useEffect } from 'react';
import { useOverlayStore } from '../stores/overlayStore';

/**
 * Hook declarativo: mientras `active` sea true mantiene una unidad
 * de refcount en el overlay store, ocultando el WCV. Cuando pasa a
 * false (o el componente se desmonta) la libera.
 */
export function useOverlay(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const { acquire, release } = useOverlayStore.getState();
    acquire();
    return () => release();
  }, [active]);
}

import { create } from 'zustand';
import { call } from '../lib/ipc';

/**
 * Overlay refcount global del renderer. Cualquier UI que necesite
 * dibujar por encima del WCV activo (modales, dropdowns que se salen
 * del sidebar) llama a `acquire` al abrirse y `release` al cerrarse.
 *
 * Cuando el contador pasa de 0 a 1 ocultamos el WCV en main; cuando
 * vuelve a 0, lo mostramos. Las transiciones intermedias (p.ej. un
 * dropdown abre un modal y se cierra) no causan parpadeo porque el
 * contador queda en >=1 mientras dura el cambio.
 */
export interface OverlayState {
  count: number;
  acquire: () => void;
  acquireAndWait: () => Promise<void>;
  release: () => void;
}

let pending: Promise<unknown> | null = null;

async function syncOverlay(active: boolean): Promise<void> {
  // Coalesce in-flight calls. La última llamada gana.
  const run = (async (): Promise<void> => {
    try {
      await call(() => window.api.layout.setOverlay({ active }));
    } catch {
      // best-effort: si falla la IPC, dejamos el estado del renderer
      // tal cual. No queremos romper la UI por un error transitorio.
    }
  })();
  pending = run;
  await run;
  if (pending === run) pending = null;
}

export const useOverlayStore = create<OverlayState>((set, get) => ({
  count: 0,
  acquire() {
    const next = get().count + 1;
    set({ count: next });
    if (next === 1) void syncOverlay(true);
  },
  async acquireAndWait() {
    const next = get().count + 1;
    set({ count: next });
    if (next === 1) await syncOverlay(true);
  },
  release() {
    const next = Math.max(0, get().count - 1);
    set({ count: next });
    if (next === 0) void syncOverlay(false);
  },
}));

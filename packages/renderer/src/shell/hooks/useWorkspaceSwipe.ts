import { useEffect } from 'react';
import { SwipeTracker, type SwipeDirection } from '@vela/shared';
import { useUiStore } from '../../stores/uiStore';

/**
 * Cambia en cuanto el gesto se arma, una sola vez por gesto: el carrusel de
 * `WorkspaceSlide` ya da la respuesta visual. Umbral menor que el de las
 * pestañas porque aquí no hay nada que perder con un cambio de más.
 */
const SIDEBAR_SWIPE = { threshold: 70, commitAt: 1 };

function canScrollX(el: Element, direction: SwipeDirection): boolean {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 1) return false;
  return direction === 'back' ? el.scrollLeft > 1 : el.scrollLeft < max - 1;
}

/** ¿Algún contenedor de la sidebar bajo el cursor (la barra de Cargas) absorbe el desplazamiento? */
function scrollsWithin(path: EventTarget[], root: HTMLElement, direction: SwipeDirection): boolean {
  for (const node of path) {
    if (node === root) return false;
    if (!(node instanceof HTMLElement)) continue;
    const overflowX = getComputedStyle(node).overflowX;
    if ((overflowX === 'auto' || overflowX === 'scroll') && canScrollX(node, direction)) return true;
  }
  return false;
}

/**
 * Swipe horizontal de dos dedos sobre la sidebar: siguiente o anterior
 * workspace, como en Arc. Deslizar hacia la izquierda trae el siguiente,
 * que es el lado por el que entra en el carrusel.
 *
 * Recibe el elemento, no un ref: la sidebar se desmonta al cerrarse y hay
 * que volver a engancharse al reabrirla.
 */
export function useWorkspaceSwipe(root: HTMLElement | null): void {
  const enabled = useUiStore((s) => s.workspaceSwipe);

  useEffect(() => {
    if (!root || !enabled) return;

    const tracker = new SwipeTracker(SIDEBAR_SWIPE);
    let endTimer: ReturnType<typeof setTimeout> | null = null;

    const onWheel = (e: WheelEvent): void => {
      // Ctrl = pellizco, Shift = scroll horizontal con la rueda del ratón.
      if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey || e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return;
      const update = tracker.feed(
        { dx: e.deltaX, dy: e.deltaY, time: e.timeStamp },
        (direction) => scrollsWithin(e.composedPath(), root, direction),
      );
      if (update.kind === 'commit') {
        void window.api.commands.execute(
          update.direction === 'forward' ? 'workspace.next' : 'workspace.previous',
        );
      }
      if (endTimer) clearTimeout(endTimer);
      endTimer = setTimeout(() => {
        endTimer = null;
        tracker.end();
      }, tracker.idleMs);
    };

    root.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      root.removeEventListener('wheel', onWheel);
      if (endTimer) clearTimeout(endTimer);
    };
  }, [root, enabled]);
}

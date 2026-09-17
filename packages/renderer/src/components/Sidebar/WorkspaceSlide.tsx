import { useEffect, useRef, type ReactNode } from 'react';
import { useUiStore } from '../../stores/uiStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';

const DURATION_MS = 220;
const EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * Lado por el que entra el workspace destino: 1 = derecha, -1 = izquierda,
 * null = sin animación. Sigue el orden de la lista. Con más de dos
 * workspaces, el salto del último al primero (y al revés) se trata como
 * continuación, igual que hacen `workspace.next` / `workspace.previous`.
 */
function slideDirection(ids: readonly string[], fromId: string, toId: string): 1 | -1 | null {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return null;
  const last = ids.length - 1;
  if (ids.length > 2) {
    if (from === last && to === 0) return 1;
    if (from === 0 && to === last) return -1;
  }
  return to > from ? 1 : -1;
}

/** Copia estática del contenido saliente: sin ids, sin foco y sin eventos. */
function snapshot(content: HTMLElement): HTMLElement {
  const ghost = content.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
  ghost.setAttribute('aria-hidden', 'true');
  ghost.setAttribute('inert', '');
  Object.assign(ghost.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  return ghost;
}

/** `cloneNode` no conserva el scroll; se copia elemento a elemento. */
function copyScrollPositions(from: HTMLElement, to: HTMLElement): void {
  const src = from.querySelectorAll<HTMLElement>('*');
  const dst = to.querySelectorAll<HTMLElement>('*');
  src.forEach((el, i) => {
    if (el.scrollTop === 0 && el.scrollLeft === 0) return;
    const target = dst[i];
    if (!target) return;
    target.scrollTop = el.scrollTop;
    target.scrollLeft = el.scrollLeft;
  });
}

/**
 * Carrusel de la sidebar al cambiar de workspace: el contenido saliente se
 * desliza fuera mientras el entrante ocupa su sitio. Solo DOM de la shell;
 * el WCV no se toca.
 */
export function WorkspaceSlide({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let running: { ghost: HTMLElement; animations: Animation[] } | null = null;

    const stop = (): void => {
      if (!running) return;
      for (const animation of running.animations) animation.cancel();
      running.ghost.remove();
      running = null;
    };

    // El listener de zustand corre antes de que React vuelva a renderizar la
    // sidebar (el commit llega en una microtarea), así que el DOM todavía
    // muestra el workspace de origen cuando se clona.
    const unsubscribe = useWorkspacesStore.subscribe((state, prev) => {
      const fromId = prev.activeWorkspaceId;
      const toId = state.activeWorkspaceId;
      if (!fromId || !toId || fromId === toId) return;
      if (!useUiStore.getState().workspaceSwitchAnimation) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const viewport = viewportRef.current;
      const content = contentRef.current;
      const direction = slideDirection(state.workspaces.map((w) => w.id), fromId, toId);
      if (!viewport || !content || direction === null) return;

      stop();
      const ghost = snapshot(content);
      viewport.appendChild(ghost);
      copyScrollPositions(content, ghost);

      const options: KeyframeAnimationOptions = { duration: DURATION_MS, easing: EASING };
      const outgoing = ghost.animate(
        [{ transform: 'translateX(0)' }, { transform: `translateX(${-direction * 100}%)` }],
        options,
      );
      const incoming = content.animate(
        [{ transform: `translateX(${direction * 100}%)` }, { transform: 'translateX(0)' }],
        options,
      );
      const current = { ghost, animations: [outgoing, incoming] };
      running = current;
      incoming.onfinish = () => {
        if (running === current) stop();
      };
    });

    return () => {
      unsubscribe();
      stop();
    };
  }, []);

  return (
    <div
      ref={viewportRef}
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div ref={contentRef} className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}

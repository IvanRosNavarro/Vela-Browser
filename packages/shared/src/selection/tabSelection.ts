import type { TreeNode } from '../types/treeNode';
import { isFolderLike } from '../types/treeNode';

/**
 * Lógica pura de la selección múltiple de pestañas de la sidebar.
 *
 * El estado vive en el renderer (es UI efímera); aquí solo están las
 * transformaciones, sin DOM ni stores, para poder probarlas en main.
 * `visibleIds` es siempre el orden visible del árbol del workspace.
 */

export interface TabSelection {
  /** Ids seleccionados, en el orden en que se añadieron. */
  ids: readonly string[];
  /** Última pestaña pulsada con Ctrl o Shift: origen del próximo rango. */
  anchorId: string | null;
}

export const EMPTY_TAB_SELECTION: TabSelection = { ids: [], anchorId: null };

/** Ctrl+clic: añade o quita la pestaña y la convierte en ancla del rango. */
export function toggleTabSelection(
  selection: TabSelection,
  id: string,
): TabSelection {
  const has = selection.ids.includes(id);
  return {
    ids: has ? selection.ids.filter((x) => x !== id) : [...selection.ids, id],
    anchorId: id,
  };
}

/**
 * Ids entre `anchorId` y `targetId`, ambos incluidos, en el orden visible.
 * Si el ancla ya no es visible (se cerró o su carpeta se plegó), el rango se
 * reduce a la pestaña pulsada. `selectable` filtra lo que puede entrar en la
 * selección (p. ej. solo pestañas, no carpetas).
 */
export function rangeBetween(
  visibleIds: readonly string[],
  anchorId: string | null,
  targetId: string,
  selectable: (id: string) => boolean = () => true,
): string[] {
  const to = visibleIds.indexOf(targetId);
  if (to === -1) return [];
  const from = anchorId === null ? -1 : visibleIds.indexOf(anchorId);
  if (from === -1) return selectable(targetId) ? [targetId] : [];
  const [lo, hi] = from <= to ? [from, to] : [to, from];
  return visibleIds.slice(lo, hi + 1).filter(selectable);
}

/**
 * Shift+clic: sustituye la selección por el rango entre el ancla y la
 * pestaña pulsada. El ancla no se mueve, como en los exploradores de
 * archivos, para que varios Shift+clic seguidos amplíen o reduzcan el rango.
 */
export function selectTabRange(
  selection: TabSelection,
  visibleIds: readonly string[],
  targetId: string,
  selectable?: (id: string) => boolean,
): TabSelection {
  const anchorId =
    selection.anchorId !== null && visibleIds.includes(selection.anchorId)
      ? selection.anchorId
      : targetId;
  return {
    ids: rangeBetween(visibleIds, anchorId, targetId, selectable),
    anchorId,
  };
}

/** Quita de la selección los ids que ya no existen (pestañas cerradas o movidas). */
export function pruneTabSelection(
  selection: TabSelection,
  existing: ReadonlySet<string>,
): TabSelection {
  const ids = selection.ids.filter((id) => existing.has(id));
  const anchorId =
    selection.anchorId !== null && existing.has(selection.anchorId)
      ? selection.anchorId
      : null;
  if (ids.length === selection.ids.length && anchorId === selection.anchorId) {
    return selection;
  }
  return { ids, anchorId };
}

/**
 * Ordena ids según el orden visible del árbol. Los que no aparecen (p. ej.
 * dentro de una carpeta plegada) van al final conservando su orden relativo.
 * Las acciones en bloque trabajan siempre en este orden para que mover o
 * agrupar respete cómo el usuario ve las pestañas.
 */
export function orderByVisible(
  ids: readonly string[],
  visibleIds: readonly string[],
): string[] {
  const rank = new Map<string, number>();
  visibleIds.forEach((id, i) => rank.set(id, i));
  return ids
    .map((id, i) => ({ id, i, r: rank.get(id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.id);
}

export interface MultiDropSlot {
  newParentId: string | null;
  /** Hueco entre hermanos. Ausente = al final del padre (lo calcula main). */
  prevPosition?: string | null;
  nextPosition?: string | null;
}

/**
 * Hueco donde soltar un grupo de nodos arrastrados. Los hermanos que también
 * se mueven no cuentan como vecinos, y el nodo destino puede ser uno de ellos
 * (soltar la selección justo antes o después de una de sus pestañas).
 * Devuelve null si el destino no admite el grupo.
 */
export function resolveMultiDropSlot(
  movingIds: ReadonlySet<string>,
  target: { nodeId: string; zone: 'before' | 'after' | 'inside' },
  nodes: readonly TreeNode[],
): MultiDropSlot | null {
  const targetNode = nodes.find((n) => n.id === target.nodeId);
  if (!targetNode) return null;

  if (target.zone === 'inside') {
    if (!isFolderLike(targetNode) || movingIds.has(targetNode.id)) return null;
    return { newParentId: targetNode.id };
  }

  const parentId = targetNode.parentId;
  const siblings = nodes
    .filter((n) => n.parentId === parentId && !movingIds.has(n.id))
    .map((n) => n.position)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const ref = targetNode.position;
  const lower = siblings.filter((p) => p < ref).pop() ?? null;
  const upper = siblings.find((p) => p > ref) ?? null;
  const targetMoves = movingIds.has(targetNode.id);

  if (target.zone === 'before') {
    return {
      newParentId: parentId,
      prevPosition: lower,
      nextPosition: targetMoves ? upper : ref,
    };
  }
  return {
    newParentId: parentId,
    prevPosition: targetMoves ? lower : ref,
    nextPosition: upper,
  };
}

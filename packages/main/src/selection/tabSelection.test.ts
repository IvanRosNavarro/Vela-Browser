import { describe, it, expect } from 'vitest';
import {
  EMPTY_TAB_SELECTION,
  orderByVisible,
  pruneTabSelection,
  rangeBetween,
  resolveMultiDropSlot,
  selectTabRange,
  toggleTabSelection,
  type TreeNode,
} from '@vela/shared';

const VISIBLE = ['a', 'b', 'folder', 'c', 'd', 'e'];
const isTab = (id: string): boolean => id !== 'folder';

describe('tabSelection', () => {
  describe('toggleTabSelection', () => {
    it('añade, quita y mueve el ancla a la pestaña pulsada', () => {
      let sel = toggleTabSelection(EMPTY_TAB_SELECTION, 'b');
      expect(sel).toEqual({ ids: ['b'], anchorId: 'b' });
      sel = toggleTabSelection(sel, 'd');
      expect(sel).toEqual({ ids: ['b', 'd'], anchorId: 'd' });
      sel = toggleTabSelection(sel, 'b');
      expect(sel).toEqual({ ids: ['d'], anchorId: 'b' });
    });
  });

  describe('rangeBetween', () => {
    it('incluye ambos extremos en orden visible, en los dos sentidos', () => {
      expect(rangeBetween(VISIBLE, 'b', 'd')).toEqual(['b', 'folder', 'c', 'd']);
      expect(rangeBetween(VISIBLE, 'd', 'b')).toEqual(['b', 'folder', 'c', 'd']);
    });

    it('filtra lo que no es seleccionable', () => {
      expect(rangeBetween(VISIBLE, 'a', 'c', isTab)).toEqual(['a', 'b', 'c']);
    });

    it('sin ancla visible se queda en la pestaña pulsada', () => {
      expect(rangeBetween(VISIBLE, null, 'c')).toEqual(['c']);
      expect(rangeBetween(VISIBLE, 'cerrada', 'c')).toEqual(['c']);
    });

    it('un destino que no está visible no selecciona nada', () => {
      expect(rangeBetween(VISIBLE, 'a', 'zzz')).toEqual([]);
    });

    it('ancla y destino iguales dan una sola pestaña', () => {
      expect(rangeBetween(VISIBLE, 'c', 'c')).toEqual(['c']);
    });
  });

  describe('selectTabRange', () => {
    it('conserva el ancla para que Shift+clic sucesivos redimensionen el rango', () => {
      let sel = toggleTabSelection(EMPTY_TAB_SELECTION, 'c');
      sel = selectTabRange(sel, VISIBLE, 'e', isTab);
      expect(sel).toEqual({ ids: ['c', 'd', 'e'], anchorId: 'c' });
      sel = selectTabRange(sel, VISIBLE, 'a', isTab);
      expect(sel).toEqual({ ids: ['a', 'b', 'c'], anchorId: 'c' });
    });

    it('sustituye la selección previa en lugar de sumarse', () => {
      let sel = toggleTabSelection(EMPTY_TAB_SELECTION, 'a');
      sel = toggleTabSelection(sel, 'e');
      sel = selectTabRange(sel, VISIBLE, 'd', isTab);
      expect(sel.ids).toEqual(['d', 'e']);
    });

    it('sin ancla el rango empieza en la pestaña pulsada', () => {
      const sel = selectTabRange(EMPTY_TAB_SELECTION, VISIBLE, 'b', isTab);
      expect(sel).toEqual({ ids: ['b'], anchorId: 'b' });
    });
  });

  describe('pruneTabSelection', () => {
    it('quita ids que ya no existen y el ancla si desapareció', () => {
      const sel = { ids: ['a', 'b', 'c'], anchorId: 'c' };
      expect(pruneTabSelection(sel, new Set(['a', 'b']))).toEqual({
        ids: ['a', 'b'],
        anchorId: null,
      });
    });

    it('devuelve la misma referencia si no cambia nada', () => {
      const sel = { ids: ['a'], anchorId: 'a' };
      expect(pruneTabSelection(sel, new Set(['a', 'b']))).toBe(sel);
    });
  });

  describe('orderByVisible', () => {
    it('ordena por el árbol visible y deja al final los no visibles', () => {
      expect(orderByVisible(['e', 'oculta', 'a', 'c'], VISIBLE)).toEqual([
        'a',
        'c',
        'e',
        'oculta',
      ]);
    });
  });

  describe('resolveMultiDropSlot', () => {
    const node = (
      id: string,
      position: string,
      parentId: string | null = null,
      kind: 'tab' | 'folder' = 'tab',
    ): TreeNode =>
      ({
        id,
        workspaceId: 'ws',
        parentId,
        kind,
        position,
        name: null,
        color: null,
        icon: null,
        collapsed: false,
        createdAt: 0,
        updatedAt: 0,
        ...(kind === 'tab'
          ? {
              url: `https://${id}.example.com`,
              originalTitle: id,
              favicon: null,
              pinned: false,
              pinnedUrl: null,
              anchored: false,
              anchoredUrl: null,
              discarded: false,
              lastActiveAt: null,
              isSecure: false,
            }
          : {}),
      }) as TreeNode;

    const nodes = [
      node('a', 'a0'),
      node('b', 'a1'),
      node('c', 'a2'),
      node('d', 'a3'),
      node('f', 'a4', null, 'folder'),
      node('x', 'a0', 'f'),
    ];

    it('antes de una pestaña no seleccionada: entre su hermano anterior y ella', () => {
      expect(
        resolveMultiDropSlot(new Set(['d']), { nodeId: 'b', zone: 'before' }, nodes),
      ).toEqual({ newParentId: null, prevPosition: 'a0', nextPosition: 'a1' });
    });

    it('después de una pestaña no seleccionada: entre ella y el siguiente hermano que no se mueve', () => {
      expect(
        resolveMultiDropSlot(new Set(['c']), { nodeId: 'b', zone: 'after' }, nodes),
      ).toEqual({ newParentId: null, prevPosition: 'a1', nextPosition: 'a3' });
    });

    it('sobre una pestaña que también se mueve, ignora su posición', () => {
      expect(
        resolveMultiDropSlot(new Set(['b', 'c']), { nodeId: 'b', zone: 'before' }, nodes),
      ).toEqual({ newParentId: null, prevPosition: 'a0', nextPosition: 'a3' });
      expect(
        resolveMultiDropSlot(new Set(['b', 'c']), { nodeId: 'c', zone: 'after' }, nodes),
      ).toEqual({ newParentId: null, prevPosition: 'a0', nextPosition: 'a3' });
    });

    it('al principio del nivel no hay hermano anterior', () => {
      expect(
        resolveMultiDropSlot(new Set(['c']), { nodeId: 'a', zone: 'before' }, nodes),
      ).toEqual({ newParentId: null, prevPosition: null, nextPosition: 'a0' });
    });

    it('dentro de una carpeta: al final, sin hueco', () => {
      expect(
        resolveMultiDropSlot(new Set(['a', 'b']), { nodeId: 'f', zone: 'inside' }, nodes),
      ).toEqual({ newParentId: 'f' });
    });

    it('rechaza soltar dentro de algo que no es carpeta o de un nodo que se mueve', () => {
      expect(
        resolveMultiDropSlot(new Set(['a']), { nodeId: 'b', zone: 'inside' }, nodes),
      ).toBeNull();
      expect(
        resolveMultiDropSlot(new Set(['f']), { nodeId: 'f', zone: 'inside' }, nodes),
      ).toBeNull();
      expect(
        resolveMultiDropSlot(new Set(['a']), { nodeId: 'zzz', zone: 'before' }, nodes),
      ).toBeNull();
    });
  });
});

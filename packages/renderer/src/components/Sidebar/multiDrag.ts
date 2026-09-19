import { orderByVisible, resolveMultiDropSlot } from '@vela/shared';
import { useTreeStore } from '../../stores/treeStore';
import { useTabSelectionStore } from '../../stores/tabSelectionStore';
import { call } from '../../lib/ipc';
import { selectVisibleFlatListWithDepth } from './flatList';
import type { DropZone } from './dropValidation';

/**
 * Suelta la selección múltiple en el destino del arrastre: una sola llamada
 * en bloque a main, en el orden visible del árbol.
 */
export async function dropSelection(
  selectedIds: readonly string[],
  workspaceId: string,
  target: { nodeId: string; zone: DropZone },
): Promise<void> {
  const state = useTreeStore.getState();
  const nodes = state.nodesByWorkspace[workspaceId] ?? [];
  const visible = selectVisibleFlatListWithDepth(state, workspaceId).map(
    (f) => f.node.id,
  );
  const ids = orderByVisible(selectedIds, visible);
  const slot = resolveMultiDropSlot(new Set(ids), target, nodes);
  if (!slot) return;
  await call(() => window.api.node.moveMany({ ids, ...slot }));
  useTabSelectionStore.getState().clear();
}

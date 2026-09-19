import { create } from 'zustand';
import {
  EMPTY_TAB_SELECTION,
  pruneTabSelection,
  selectTabRange,
  toggleTabSelection,
  type TabSelection,
} from '@vela/shared';

/**
 * Selección múltiple de pestañas en el árbol de la sidebar. Es UI efímera:
 * vive solo en el renderer, no se persiste y se vacía al cambiar de
 * workspace. La lógica (rangos, poda) está en `@vela/shared`.
 */
interface TabSelectionState extends TabSelection {
  /** Workspace al que pertenece la selección actual. */
  workspaceId: string | null;
  /** Ctrl+clic. */
  toggle: (workspaceId: string, tabId: string) => void;
  /**
   * Shift+clic. `fallbackAnchorId` (la pestaña activa) hace de origen si aún
   * no hay ancla, como en Chrome.
   */
  selectRange: (
    workspaceId: string,
    visibleIds: readonly string[],
    tabId: string,
    selectable: (id: string) => boolean,
    fallbackAnchorId: string | null,
  ) => void;
  clear: () => void;
  /** Quita pestañas que ya no están en el workspace (cerradas o movidas). */
  prune: (workspaceId: string, existing: ReadonlySet<string>) => void;
}

function base(state: TabSelectionState, workspaceId: string): TabSelection {
  return state.workspaceId === workspaceId
    ? { ids: state.ids, anchorId: state.anchorId }
    : EMPTY_TAB_SELECTION;
}

export const useTabSelectionStore = create<TabSelectionState>((set, get) => ({
  ...EMPTY_TAB_SELECTION,
  workspaceId: null,

  toggle: (workspaceId, tabId) => {
    const next = toggleTabSelection(base(get(), workspaceId), tabId);
    set({ ...next, workspaceId });
  },

  selectRange: (workspaceId, visibleIds, tabId, selectable, fallbackAnchorId) => {
    const current = base(get(), workspaceId);
    const seeded: TabSelection =
      current.anchorId === null && fallbackAnchorId !== null
        ? { ids: current.ids, anchorId: fallbackAnchorId }
        : current;
    const next = selectTabRange(seeded, visibleIds, tabId, selectable);
    set({ ...next, workspaceId });
  },

  clear: () => {
    const s = get();
    if (s.ids.length === 0 && s.anchorId === null) return;
    set({ ...EMPTY_TAB_SELECTION });
  },

  prune: (workspaceId, existing) => {
    const s = get();
    if (s.workspaceId !== workspaceId) return;
    const current: TabSelection = { ids: s.ids, anchorId: s.anchorId };
    const next = pruneTabSelection(current, existing);
    if (next !== current) set({ ...next });
  },
}));

/** Ids seleccionados si la pestaña forma parte de una selección de 2 o más. */
export function bulkSelectionFor(tabId: string): string[] | null {
  const { ids } = useTabSelectionStore.getState();
  return ids.length > 1 && ids.includes(tabId) ? [...ids] : null;
}

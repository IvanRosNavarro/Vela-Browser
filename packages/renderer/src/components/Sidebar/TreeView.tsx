import { useMemo } from 'react';
import { List, type RowComponentProps } from 'react-window';
import type { SidebarMode } from '@vela/shared';
import { useTreeStore } from '../../stores/treeStore';
import { useUiStore } from '../../stores/uiStore';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { TreeNodeRow } from './TreeNodeRow';
import { EmptyState } from './EmptyState';
import {
  selectVisibleFlatListWithDepth,
  type FlatNode,
} from './flatList';
import type { ActiveDrop } from './types';

const VIRTUALIZE_THRESHOLD = 100;

interface TreeViewProps {
  workspaceId: string;
  mode: SidebarMode;
  activeDrop: ActiveDrop | null;
}

interface RowProps {
  flat: FlatNode[];
  inheritedColors: Map<string, string | null>;
  mode: SidebarMode;
  rowHeight: number;
  indent: number;
  inheritedColorEnabled: boolean;
  showIndentationGuides: boolean;
  activeTabId: string | null;
  activeDrop: ActiveDrop | null;
}

function RowComponent({
  index,
  style,
  flat,
  inheritedColors,
  mode,
  rowHeight,
  indent,
  inheritedColorEnabled,
  showIndentationGuides,
  activeTabId,
  activeDrop,
}: RowComponentProps<RowProps>) {
  const item = flat[index];
  if (!item) return null;
  return (
    <TreeNodeRow
      style={style}
      node={item.node}
      depth={item.depth}
      mode={mode}
      rowHeight={rowHeight}
      indent={indent}
      inheritedColor={inheritedColors.get(item.node.id) ?? null}
      inheritedColorEnabled={inheritedColorEnabled}
      showIndentationGuides={showIndentationGuides}
      isActive={item.node.kind === 'tab' && item.node.id === activeTabId}
      activeDrop={activeDrop}
    />
  );
}

export function TreeView({ workspaceId, mode, activeDrop }: TreeViewProps) {
  const flat = useTreeStore((s) =>
    selectVisibleFlatListWithDepth(s, workspaceId),
  );
  const allNodes = useTreeStore(
    (s) => s.nodesByWorkspace[workspaceId] ?? [],
  );
  const inheritedColorEnabled = useUiStore((s) => s.inheritedColorEnabled);
  const showIndentationGuides = useUiStore((s) => s.indentationGuides);
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabId = useRuntimeStore((s) =>
    currentWindowId !== null
      ? (s.activeTabIdByWindow[currentWindowId] ?? null)
      : null,
  );

  const compact = mode === 'compact';
  const rowHeight = compact ? 40 : 32;
  const indent = compact ? 8 : 10;

  const inheritedColors = useMemo(() => {
    const byId = new Map(allNodes.map((n) => [n.id, n] as const));
    const cache = new Map<string, string | null>();
    function resolve(id: string): string | null {
      if (cache.has(id)) return cache.get(id) ?? null;
      const n = byId.get(id);
      if (!n || !n.parentId) {
        cache.set(id, null);
        return null;
      }
      const parent = byId.get(n.parentId);
      if (!parent) {
        cache.set(id, null);
        return null;
      }
      const inherited = parent.color ?? resolve(parent.id);
      cache.set(id, inherited);
      return inherited;
    }
    for (const n of allNodes) resolve(n.id);
    return cache;
  }, [allNodes]);

  if (flat.length === 0) {
    return <EmptyState />;
  }

  const rowProps: RowProps = {
    flat,
    inheritedColors,
    mode,
    rowHeight,
    indent,
    inheritedColorEnabled,
    showIndentationGuides,
    activeTabId,
    activeDrop,
  };

  if (flat.length > VIRTUALIZE_THRESHOLD) {
    return (
      <div className="flex-1 min-h-0">
        <List
          rowCount={flat.length}
          rowHeight={rowHeight}
          rowComponent={RowComponent}
          rowProps={rowProps}
          style={{ height: '100%', width: '100%' }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" role="list">
      {flat.map((item) => (
        <TreeNodeRow
          key={item.node.id}
          node={item.node}
          depth={item.depth}
          mode={mode}
          rowHeight={rowHeight}
          indent={indent}
          inheritedColor={inheritedColors.get(item.node.id) ?? null}
          inheritedColorEnabled={inheritedColorEnabled}
          showIndentationGuides={showIndentationGuides}
          isActive={item.node.kind === 'tab' && item.node.id === activeTabId}
          activeDrop={activeDrop}
        />
      ))}
    </div>
  );
}

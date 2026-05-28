import { memo, type CSSProperties } from 'react';
import type { SidebarMode, TabNode, TreeNode } from '@vela/shared';
import { isFolderLike } from '@vela/shared';
import { TabRow } from './TabRow';
import { FolderRow } from './FolderRow';
import { IndentationGuides } from './IndentationGuides';
import type { ActiveDrop } from './types';

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  mode: SidebarMode;
  rowHeight: number;
  indent: number;
  inheritedColor: string | null;
  inheritedColorEnabled: boolean;
  showIndentationGuides: boolean;
  isActive: boolean;
  activeDrop: ActiveDrop | null;
  style?: CSSProperties;
}

function TreeNodeRowImpl(props: TreeNodeRowProps) {
  const {
    node,
    depth,
    mode,
    rowHeight,
    indent,
    inheritedColor,
    inheritedColorEnabled,
    showIndentationGuides,
    isActive,
    activeDrop,
    style,
  } = props;

  return (
    <div
      className="relative overflow-hidden"
      style={{ ...style, height: rowHeight }}
      data-node-id={node.id}
    >
      <IndentationGuides
        depth={depth}
        indent={indent}
        enabled={showIndentationGuides && mode === 'normal'}
      />
      {isFolderLike(node) ? (
        <FolderRow
          node={node}
          depth={depth}
          mode={mode}
          rowHeight={rowHeight}
          indent={indent}
          inheritedColor={inheritedColor}
          inheritedColorEnabled={inheritedColorEnabled}
          isActive={isActive}
          activeDrop={activeDrop}
        />
      ) : (
        <TabRow
          node={node as TabNode}
          depth={depth}
          mode={mode}
          rowHeight={rowHeight}
          indent={indent}
          inheritedColor={inheritedColor}
          inheritedColorEnabled={inheritedColorEnabled}
          isActive={isActive}
          activeDrop={activeDrop}
        />
      )}
    </div>
  );
}

export const TreeNodeRow = memo(TreeNodeRowImpl);

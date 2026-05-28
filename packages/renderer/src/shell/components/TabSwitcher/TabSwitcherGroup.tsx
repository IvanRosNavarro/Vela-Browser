import { useState } from 'react';
import type { TabNode, Workspace } from '@vela/shared';
import { TabSwitcherRow } from './TabSwitcherRow';

interface TabSwitcherGroupProps {
  workspace: Workspace;
  tabs: TabNode[];
  activeTabId: string | null;
  playingTabIds: Set<string>;
  navOffset: number;
  onActivate: (tab: TabNode) => void;
}

export function TabSwitcherGroup({
  workspace,
  tabs,
  activeTabId,
  playingTabIds,
  navOffset,
  onActivate,
}: TabSwitcherGroupProps) {
  const [collapsed, setCollapsed] = useState(false);

  const headerBg = workspace.color
    ? `${workspace.color}26`
    : 'var(--vela-bg-elevated)';

  return (
    <div>
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 14px',
          height: 28,
          background: headerBg,
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--vela-fg)',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: 'var(--vela-font-family)',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {workspace.icon ? `${workspace.icon} ` : ''}{workspace.name}
        </span>
        <span style={{ color: 'var(--vela-fg-muted)', fontWeight: 400 }}>
          ({tabs.length})
        </span>
        <span style={{ color: 'var(--vela-fg-muted)', fontSize: 10 }}>
          {collapsed ? '▶' : '▼'}
        </span>
      </button>

      {!collapsed && tabs.map((tab, i) => (
        <TabSwitcherRow
          key={tab.id}
          tab={tab}
          workspace={workspace}
          isActive={tab.id === activeTabId}
          navIndex={navOffset + i}
          isPlaying={playingTabIds.has(tab.id)}
          onActivate={() => onActivate(tab)}
        />
      ))}
    </div>
  );
}

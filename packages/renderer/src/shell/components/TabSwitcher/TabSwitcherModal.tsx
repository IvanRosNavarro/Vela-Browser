import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTabSwitcherStore } from '../../../stores/tabSwitcherStore';
import { useTreeStore } from '../../../stores/treeStore';
import { useWorkspacesStore } from '../../../stores/workspacesStore';
import { useRuntimeStore } from '../../../stores/runtimeStore';
import { useMediaStore } from '../../../stores/mediaStore';
import { useOverlayStore } from '../../../stores/overlayStore';
import { call } from '../../../lib/ipc';
import { fuzzyFilter } from '../../../lib/fuzzy';
import { TabSwitcherSearch } from './TabSwitcherSearch';
import { TabSwitcherGroup } from './TabSwitcherGroup';
import { TabSwitcherRow } from './TabSwitcherRow';
import { TabSwitcherRecentRow } from './TabSwitcherRecentRow';
import { useTabSwitcherKeyboard, type NavigableItem } from './useTabSwitcherKeyboard';
import type { TabNode, Workspace } from '@vela/shared';

const RECENT_DISPLAY_LIMIT = 5;

export function TabSwitcherModal() {
  const isOpen = useTabSwitcherStore((s) => s.isOpen);
  const query = useTabSwitcherStore((s) => s.query);
  const recentlyClosed = useTabSwitcherStore((s) => s.recentlyClosed);
  const close = useTabSwitcherStore((s) => s.close);

  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);
  const activationOrder = useWorkspacesStore((s) => s.workspaceActivationOrder);
  const nodesByWorkspace = useTreeStore((s) => s.nodesByWorkspace);
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabIdByWindow = useRuntimeStore((s) => s.activeTabIdByWindow);
  const activeTabId = currentWindowId !== null ? (activeTabIdByWindow[currentWindowId] ?? null) : null;
  const mediaSources = useMediaStore((s) => s.sources);

  const playingTabIds = useMemo(
    () => new Set(mediaSources.filter((s) => s.isPlaying).map((s) => s.tabId)),
    [mediaSources],
  );

  const acquire = useOverlayStore((s) => s.acquire);
  const release = useOverlayStore((s) => s.release);

  useEffect(() => {
    if (!isOpen) return;
    acquire();
    return () => { release(); };
  }, [isOpen, acquire, release]);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [recentExpanded, setRecentExpanded] = useState(false);

  // Ordered workspaces: active first, rest by MRU
  const orderedWorkspaces = useMemo<Workspace[]>(() => {
    const active = workspaces.find((w) => w.id === activeWorkspaceId);
    const rest = workspaces
      .filter((w) => w.id !== activeWorkspaceId)
      .sort((a, b) => {
        const ai = activationOrder.indexOf(a.id);
        const bi = activationOrder.indexOf(b.id);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
    return active ? [active, ...rest] : rest;
  }, [workspaces, activeWorkspaceId, activationOrder]);

  const workspaceMap = useMemo(() => {
    const m = new Map<string, Workspace>();
    for (const ws of workspaces) m.set(ws.id, ws);
    return m;
  }, [workspaces]);

  // All tabs from loaded workspaces
  const allTabs = useMemo<TabNode[]>(() => {
    const result: TabNode[] = [];
    for (const wsId of Object.keys(nodesByWorkspace)) {
      const nodes = nodesByWorkspace[wsId] ?? [];
      for (const node of nodes) {
        if (node.kind === 'tab') result.push(node);
      }
    }
    return result;
  }, [nodesByWorkspace]);

  // Filtered flat list (when query is set)
  const filteredTabs = useMemo(() => {
    if (!query) return [];
    return fuzzyFilter(
      allTabs,
      query,
      (t) => [t.name ?? t.originalTitle ?? '', t.url],
    );
  }, [allTabs, query]);

  const activateTab = useCallback(
    async (tab: TabNode) => {
      if (tab.workspaceId !== activeWorkspaceId) {
        await useWorkspacesStore.getState().setActive(tab.workspaceId);
      }
      await call(() => window.api.tab.activate({ id: tab.id }));
      close();
    },
    [activeWorkspaceId, close],
  );

  const handleCtrlEnterTab = useCallback(
    async (tabId: string) => {
      if (currentWindowId === null) return;
      await call(() =>
        window.api.layout.openTabInUnfocusedPanel({ tabId, windowId: currentWindowId }),
      );
      close();
    },
    [currentWindowId, close],
  );

  // Build flat navigable list for keyboard
  const flatNavigable = useMemo<NavigableItem[]>(() => {
    const items: NavigableItem[] = [];

    if (query) {
      for (const tab of filteredTabs) {
        const t = tab;
        items.push({
          type: 'tab',
          tabId: t.id,
          workspaceId: t.workspaceId,
          onActivate: () => { void activateTab(t); },
        });
      }
    } else {
      // Recent closed (visible ones)
      const visibleRecent = recentlyClosed.slice(0, recentExpanded ? recentlyClosed.length : RECENT_DISPLAY_LIMIT);
      for (const entry of visibleRecent) {
        const e = entry;
        items.push({
          type: 'recent',
          closedTabId: e.tabId,
          onActivate: () => {
            void call(() => window.api.tab.reopenById({ closedTabId: e.tabId })).then(() => close());
          },
        });
      }
      // Tabs by workspace
      for (const ws of orderedWorkspaces) {
        const tabs = (nodesByWorkspace[ws.id] ?? []).filter((n): n is TabNode => n.kind === 'tab');
        for (const tab of tabs) {
          const t = tab;
          items.push({
            type: 'tab',
            tabId: t.id,
            workspaceId: ws.id,
            onActivate: () => { void activateTab(t); },
          });
        }
      }
    }

    return items;
  }, [query, filteredTabs, recentlyClosed, recentExpanded, orderedWorkspaces, nodesByWorkspace, activateTab, close]);

  useTabSwitcherKeyboard({
    flatNavigable,
    inputRef,
    scrollRef,
    isOpen,
    onCtrlEnterTab: handleCtrlEnterTab,
  });

  // Keyboard-calculated tab nav offsets for grouped mode
  const tabNavOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    if (query) return offsets;
    let idx = recentlyClosed.length > 0
      ? (recentExpanded ? recentlyClosed.length : Math.min(recentlyClosed.length, RECENT_DISPLAY_LIMIT))
      : 0;
    for (const ws of orderedWorkspaces) {
      offsets.set(ws.id, idx);
      const tabs = (nodesByWorkspace[ws.id] ?? []).filter((n) => n.kind === 'tab');
      idx += tabs.length;
    }
    return offsets;
  }, [query, recentlyClosed, recentExpanded, orderedWorkspaces, nodesByWorkspace]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh',
        background: 'rgba(0,0,0,0.55)',
      }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 640,
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'color-mix(in srgb, var(--vela-bg-elevated) calc(var(--sidebar-background-opacity, 1) * 100%), transparent)',
          backdropFilter: 'var(--sidebar-backdrop-filter)',
          borderRadius: 'var(--vela-radius-lg)',
          border: '1px solid var(--vela-border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          animation: 'tab-switcher-in 150ms ease-out',
        }}
      >
        <style>{`
          @keyframes tab-switcher-in {
            from { opacity: 0; transform: scale(0.96); }
            to   { opacity: 1; transform: scale(1); }
          }
        `}</style>

        <TabSwitcherSearch inputRef={inputRef} />

        <div
          ref={scrollRef}
          style={{ overflowY: 'auto', flex: 1 }}
        >
          {/* No query: grouped view */}
          {!query && (
            <>
              {recentlyClosed.length > 0 && (
                <RecentlyClosedSection
                  recentlyClosed={recentlyClosed}
                  expanded={recentExpanded}
                  onToggle={() => setRecentExpanded((v) => !v)}
                  navOffset={0}
                />
              )}

              {orderedWorkspaces.map((ws) => {
                const tabs = (nodesByWorkspace[ws.id] ?? []).filter(
                  (n): n is TabNode => n.kind === 'tab',
                );
                if (tabs.length === 0) return null;
                return (
                  <TabSwitcherGroup
                    key={ws.id}
                    workspace={ws}
                    tabs={tabs}
                    activeTabId={activeTabId}
                    playingTabIds={playingTabIds}
                    navOffset={tabNavOffsets.get(ws.id) ?? 0}
                    onActivate={activateTab}
                  />
                );
              })}
            </>
          )}

          {/* With query: flat filtered list */}
          {query && filteredTabs.length > 0 && filteredTabs.map((tab, i) => {
            const ws = workspaceMap.get(tab.workspaceId);
            if (!ws) return null;
            return (
              <TabSwitcherRow
                key={tab.id}
                tab={tab}
                workspace={ws}
                isActive={tab.id === activeTabId}
                navIndex={i}
                showWorkspaceBadge
                isPlaying={playingTabIds.has(tab.id)}
                matchPositions={tab._positions}
                onActivate={() => { void activateTab(tab); }}
              />
            );
          })}

          {/* No results */}
          {query && filteredTabs.length === 0 && (
            <div
              style={{
                padding: '32px 14px',
                textAlign: 'center',
                color: 'var(--vela-fg-muted)',
                fontSize: 13,
              }}
            >
              <div>No se encontraron pestañas</div>
              <div style={{ marginTop: 6, fontSize: 12 }}>
                <button
                  onClick={() => {
                    void call(() =>
                      window.api.window.openUrlInNewTab({ url: 'vela://history', activate: true }),
                    );
                    close();
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--vela-accent)',
                    textDecoration: 'underline',
                    fontSize: 12,
                    fontFamily: 'var(--vela-font-family)',
                  }}
                >
                  Buscar en el historial completo →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecentlyClosedSection({
  recentlyClosed,
  expanded,
  onToggle,
  navOffset,
}: {
  recentlyClosed: ReturnType<typeof useTabSwitcherStore.getState>['recentlyClosed'];
  expanded: boolean;
  onToggle: () => void;
  navOffset: number;
}) {
  const displayList = expanded
    ? recentlyClosed
    : recentlyClosed.slice(0, RECENT_DISPLAY_LIMIT);

  return (
    <div>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 14px',
          height: 28,
          background: 'var(--vela-bg-elevated)',
          border: 'none',
          borderBottom: '1px solid var(--vela-border)',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'var(--vela-fg-muted)',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'var(--vela-font-family)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        <span style={{ flex: 1 }}>Cerradas recientemente</span>
        <span style={{ fontSize: 10 }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {displayList.map((entry, i) => (
        <TabSwitcherRecentRow
          key={entry.tabId}
          entry={entry}
          navIndex={navOffset + i}
        />
      ))}

      {!expanded && recentlyClosed.length > RECENT_DISPLAY_LIMIT && (
        <button
          onClick={onToggle}
          style={{
            width: '100%',
            padding: '4px 14px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--vela-fg-muted)',
            fontSize: 11,
            fontFamily: 'var(--vela-font-family)',
            textAlign: 'left',
          }}
        >
          Ver {recentlyClosed.length - RECENT_DISPLAY_LIMIT} más…
        </button>
      )}
    </div>
  );
}

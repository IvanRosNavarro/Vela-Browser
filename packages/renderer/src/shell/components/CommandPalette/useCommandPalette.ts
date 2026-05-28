import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { call } from '../../../lib/ipc';
import { fuzzyFilter } from '../../../lib/fuzzy';
import { useCommandPaletteStore } from '../../../stores/commandPaletteStore';
import { useRuntimeStore } from '../../../stores/runtimeStore';
import { useWorkspacesStore } from '../../../stores/workspacesStore';
import { useLayoutStore } from '../../../stores/layoutStore';
import { useTreeStore } from '../../../stores/treeStore';
import { getPaletteCommandDef, type PaletteCommandDef, type PaletteContext } from './paletteCommands';
import type { ShortcutCommandInfo, TabNode, Workspace } from '@vela/shared';

export interface PaletteEntry {
  id: string;
  title: string;
  category: string;
  shortcut: string | null;
  paletteCmd: PaletteCommandDef;
  _score: number;
  _positions: number[];
}

const CATEGORY_LABELS: Record<string, string> = {
  tab: 'Pestañas',
  workspace: 'Workspaces',
  folder: 'Carpetas',
  navigation: 'Navegación',
  window: 'Ventana',
  view: 'Vista',
  profile: 'Perfiles',
  internal: 'General',
  reader: 'Lectura',
  screenshot: 'Captura',
};

export function getCategoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat;
}

function buildContext(): PaletteContext {
  const { currentWindowId, activeTabIdByWindow, currentProfileId } = useRuntimeStore.getState();
  const { activeWorkspaceId } = useWorkspacesStore.getState();
  const { layout } = useLayoutStore.getState();
  const activeTabId = currentWindowId !== null ? (activeTabIdByWindow[currentWindowId] ?? null) : null;
  return {
    activeTabId,
    activeWorkspaceId,
    layoutMode: layout.mode,
    profileId: currentProfileId,
  };
}

export function useCommandPalette() {
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const query = useCommandPaletteStore((s) => s.query);
  const selectedIndex = useCommandPaletteStore((s) => s.selectedIndex);
  const mode = useCommandPaletteStore((s) => s.mode);
  const selectedCommand = useCommandPaletteStore((s) => s.selectedCommand);
  const argValues = useCommandPaletteStore((s) => s.argValues);
  const { close, setQuery, setSelectedIndex, selectCommand, setArgValue, backToList } =
    useCommandPaletteStore.getState();

  const [allCommands, setAllCommands] = useState<ShortcutCommandInfo[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load command list once on open.
  useEffect(() => {
    if (!isOpen) return;
    void (async () => {
      try {
        const res = await call(() => window.api.shortcuts.getAll());
        setAllCommands(res);
      } catch {
        setAllCommands([]);
      }
    })();
  }, [isOpen]);

  // Auto-focus input when opened.
  useEffect(() => {
    if (isOpen && mode === 'list') {
      requestAnimationFrame(() => { inputRef.current?.focus(); });
    }
  }, [isOpen, mode]);

  const ctx = useMemo(() => buildContext(), []);

  // Detect pre-select signal.
  const preselectId = useMemo(() => {
    if (query.startsWith('__preselect__')) return query.slice('__preselect__'.length);
    return null;
  }, [query]);

  // When a pre-select is detected, find and select the command after commands load.
  useEffect(() => {
    if (!preselectId || allCommands.length === 0) return;
    const info = allCommands.find((c) => c.id === preselectId);
    if (!info) return;
    const palCmd = getPaletteCommandDef(preselectId) ?? { id: preselectId };
    const entry: PaletteCommandDef = {
      ...palCmd,
      id: info.id,
      title: info.title,
      category: info.category,
      defaultShortcut: info.defaultShortcut ?? null,
    };
    // Clear the signal before selecting so we don't loop.
    useCommandPaletteStore.setState({ query: '' });
    selectCommand(entry);
  }, [preselectId, allCommands, selectCommand]);

  // Build visible commands list.
  const visibleCommands = useMemo<PaletteEntry[]>(() => {
    const effectiveCtx = buildContext();
    return allCommands
      .map((info): PaletteEntry => {
        const palCmd = getPaletteCommandDef(info.id) ?? { id: info.id };
        return {
          id: info.id,
          title: info.title,
          category: info.category,
          shortcut: info.customShortcut !== undefined
            ? info.customShortcut
            : (info.defaultShortcut ?? null),
          paletteCmd: { ...palCmd, id: info.id, title: info.title, category: info.category },
          _score: 0,
          _positions: [],
        };
      })
      .filter((entry) => {
        const when = getPaletteCommandDef(entry.id)?.when;
        return !when || when(effectiveCtx);
      });
  }, [allCommands]);

  // Effective query (never the preselect signal).
  const effectiveQuery = preselectId ? '' : query;

  // Filtered and scored results.
  const filteredCommands = useMemo<PaletteEntry[]>(() => {
    if (!effectiveQuery) return visibleCommands.map((c) => ({ ...c, _score: 0, _positions: [] }));
    const scored = fuzzyFilter(visibleCommands, effectiveQuery, (c) => [c.title, c.category, c.id]);
    return scored.map((s) => ({
      ...s,
      _positions: s._positions,
    }));
  }, [visibleCommands, effectiveQuery]);

  // Grouped by category (only when no query).
  const groupedCommands = useMemo(() => {
    const map = new Map<string, PaletteEntry[]>();
    for (const cmd of filteredCommands) {
      const cat = cmd.category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(cmd);
    }
    return map;
  }, [filteredCommands]);

  const hasQuery = Boolean(effectiveQuery);

  // Keyboard navigation.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (mode === 'args') {
        if (e.key === 'Escape') { e.preventDefault(); backToList(); }
        return;
      }

      const total = filteredCommands.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (selectedIndex + 1) % total;
        setSelectedIndex(next);
        scrollToItem(listRef.current, next);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = (selectedIndex - 1 + total) % total;
        setSelectedIndex(prev);
        scrollToItem(listRef.current, prev);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const entry = filteredCommands[selectedIndex];
        if (entry) executeOrSelectCommand(entry);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    },
    [mode, filteredCommands, selectedIndex, setSelectedIndex, close, backToList],
  );

  function executeOrSelectCommand(entry: PaletteEntry) {
    const palCmd: PaletteCommandDef = {
      ...entry.paletteCmd,
      id: entry.id,
      title: entry.title,
      category: entry.category,
      defaultShortcut: entry.shortcut,
    };
    if (palCmd.args && palCmd.args.length > 0) {
      selectCommand(palCmd);
    } else {
      void executeCommand(palCmd, {});
    }
  }

  async function executeCommand(cmd: PaletteCommandDef, args: Record<string, string>) {
    const effectiveCtx = buildContext();
    if (cmd.run) {
      await cmd.run(effectiveCtx, args);
    } else {
      await call(() => window.api.commands.execute(cmd.id));
    }
    close();
  }

  // Execute with collected args.
  const executeWithArgs = useCallback(async () => {
    if (!selectedCommand) return;
    const args = selectedCommand.args ?? [];
    const missing = args.filter((a) => a.required && !argValues[a.id]?.trim());
    if (missing.length > 0) return;
    await executeCommand(selectedCommand, argValues);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCommand, argValues]);

  // Dynamic options for 'tab' and 'workspace' arg types.
  const nodesByWorkspace = useTreeStore((s) => s.nodesByWorkspace);
  const workspaces = useWorkspacesStore((s) => s.workspaces);

  const tabOptions = useMemo<Array<{ value: string; label: string }>>(() => {
    const tabs: TabNode[] = [];
    for (const nodes of Object.values(nodesByWorkspace)) {
      for (const n of nodes) {
        if (n.kind === 'tab') tabs.push(n);
      }
    }
    return tabs.map((t) => ({ value: t.id, label: t.name ?? t.originalTitle ?? t.url }));
  }, [nodesByWorkspace]);

  const workspaceOptions = useMemo<Array<{ value: string; label: string }>>(() =>
    workspaces.map((w: Workspace) => ({ value: w.id, label: w.name })),
    [workspaces],
  );

  return {
    isOpen,
    query: effectiveQuery,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    mode,
    selectedCommand,
    argValues,
    setArgValue,
    backToList,
    filteredCommands,
    groupedCommands,
    hasQuery,
    executeOrSelectCommand,
    executeWithArgs,
    executeCommand,
    handleKeyDown,
    inputRef,
    listRef,
    close,
    ctx,
    tabOptions,
    workspaceOptions,
  };
}

function scrollToItem(container: HTMLDivElement | null, index: number) {
  if (!container) return;
  const item = container.querySelector<HTMLElement>(`[data-palette-index="${index}"]`);
  item?.scrollIntoView({ block: 'nearest' });
}

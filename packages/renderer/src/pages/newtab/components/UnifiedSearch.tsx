import { useEffect, useRef, useState } from 'react';
import {
  buildSearchUrl,
  searchEngineLabel,
  type SearchSettings,
  type Workspace,
} from '@vela/shared';
import type { TreeNode } from '@vela/shared';
import { resolveQueryToUrl } from '../../../components/AddressBar/url';
import {
  SearchResults,
  type AnyResult,
  type TabResult,
  type HistoryResult,
  type SearchEngineResult,
  type NavigateResult,
} from './SearchResults';

interface Props {
  workspaces: Workspace[];
  nodesByWorkspace: Record<string, TreeNode[]>;
  searchSettings: SearchSettings;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function UnifiedSearch({ workspaces, nodesByWorkspace, searchSettings }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tabResults, setTabResults] = useState<TabResult[]>([]);
  const [historyResults, setHistoryResults] = useState<HistoryResult[]>([]);
  const [engineResult, setEngineResult] = useState<SearchEngineResult | null>(null);
  const [navigateResult, setNavigateResult] = useState<NavigateResult | null>(null);

  const debouncedQuery = useDebounce(query, 120);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery]);

  useEffect(() => {
    const q = debouncedQuery.trim();

    if (!q) {
      setTabResults([]);
      setHistoryResults([]);
      setEngineResult(null);
      setNavigateResult(null);
      return;
    }

    const lower = q.toLowerCase();

    // 1. Search open tabs (local, no IPC)
    const tabs: TabResult[] = [];
    for (const ws of workspaces) {
      const nodes = nodesByWorkspace[ws.id] ?? [];
      for (const node of nodes) {
        if (node.kind !== 'tab') continue;
        const displayTitle = node.name ?? node.originalTitle;
        const titleMatch = displayTitle.toLowerCase().includes(lower);
        const urlMatch = node.url.toLowerCase().includes(lower);
        if (titleMatch || urlMatch) {
          tabs.push({
            type: 'tab',
            tabId: node.id,
            title: displayTitle || node.url,
            url: node.url,
            favicon: node.favicon,
            workspaceId: ws.id,
            workspaceName: ws.name,
          });
        }
      }
    }
    setTabResults(tabs.slice(0, 3));

    // 2. Search history
    void window.api.history.search({ query: q, limit: 5 }).then((res) => {
      if (!res.ok) return;
      setHistoryResults(
        res.data.map((e) => ({
          type: 'history' as const,
          id: e.id,
          title: e.title,
          url: e.url,
          favicon: e.favicon,
          visitedAt: e.visitedAt,
        })),
      );
    });

    // 3. Exact result: navigate for URLs, engine for search queries
    const resolved = resolveQueryToUrl(q);
    if (resolved.type === 'url') {
      setNavigateResult({ type: 'navigate', url: resolved.value });
      setEngineResult(null);
    } else {
      setNavigateResult(null);
      const label = searchEngineLabel(searchSettings);
      setEngineResult({
        type: 'engine',
        query: q,
        url: buildSearchUrl(searchSettings, q),
        engineName: label,
      });
    }
  }, [debouncedQuery, workspaces, nodesByWorkspace, searchSettings]);

  const allResults: AnyResult[] = [
    ...(navigateResult ? [navigateResult] : []),
    ...(engineResult ? [engineResult] : []),
    ...tabResults,
    ...historyResults,
  ];

  const totalResults = allResults.length;

  function handleSelect(result: AnyResult) {
    if (result.type === 'tab') {
      void window.api.tab.activate({ id: result.tabId });
    } else {
      window.location.href = result.url;
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, totalResults - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = allResults[selectedIndex];
      if (selected) {
        handleSelect(selected);
      } else if (query.trim()) {
        const resolved = resolveQueryToUrl(query.trim());
        if (resolved.type === 'url') {
          window.location.href = resolved.value;
        } else {
          window.location.href = buildSearchUrl(searchSettings, query.trim());
        }
      }
    } else if (e.key === 'Escape') {
      setQuery('');
      setTabResults([]);
      setHistoryResults([]);
      setEngineResult(null);
    }
  }

  const hasQuery = query.trim().length > 0;
  const showResults = hasQuery && totalResults > 0;
  const showNoResults = hasQuery && totalResults === 0;

  return (
    <div className="w-full max-w-2xl">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Buscar o escribir una URL..."
        className="w-full rounded-xl border border-[var(--vela-border)] bg-[var(--vela-bg-surface)] px-5 py-3 text-lg text-[var(--vela-fg)] placeholder:text-[var(--vela-fg-muted)] shadow-sm outline-none transition-shadow focus:border-[var(--vela-accent)] focus:shadow-md focus:shadow-[var(--vela-accent)]/10"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {showResults && (
        <div className="mt-2">
          <SearchResults
            navigate={navigateResult}
            tabs={tabResults}
            history={historyResults}
            engine={engineResult}
            selectedIndex={selectedIndex}
            onSelect={handleSelect}
            onHover={setSelectedIndex}
          />
        </div>
      )}
      {showNoResults && (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => void window.api.commands.execute('internal.openHistory')}
            className="text-xs text-[var(--vela-accent)] hover:underline"
          >
            Busca en el historial completo →
          </button>
        </div>
      )}
    </div>
  );
}
